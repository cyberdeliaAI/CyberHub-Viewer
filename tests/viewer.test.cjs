// Run: node --test tests/viewer.test.cjs
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../modules/viewer/__init__.py'), 'utf8');
const script = source.split('<script>')[1].split('</script>')[0];

function harness(savedPosition = null, storageUnavailable = false) {
    const elements = new Map(), requests = [], urls = [], revoked = [], observers = [], stored = {};
    class Element {
        constructor(tag = 'div') {
            this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {};
            this.listeners = {}; this.value = ''; this.checked = false; this.hidden = false;
            this.textContent = ''; this.innerHTML = ''; this.files = []; this.webkitdirectory = false;
            const classes = new Set();
            this.classList = {add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c)};
        }
        addEventListener(name, callback) { (this.listeners[name] ??= []).push(callback); }
        emit(name, event = {}) { for (const f of this.listeners[name] || []) f.call(this, {target:this, preventDefault(){}, ...event}); }
        click() { if (!this.disabled) this.emit('click'); }
        append(...children) { for (const child of children) child.tagName === 'fragment' ? this.append(...child.children) : this.children.push(child); }
        appendChild(child) { this.append(child); }
        replaceChildren(...children) { this.children = []; this.append(...children); this.innerHTML = ''; }
        setAttribute(key, value) { this.attributes[key] = String(value); }
        getAttribute(key) { return key === 'src' ? this.src ?? null : this.attributes[key] ?? null; }
        removeAttribute(key) { delete this.attributes[key]; if (key === 'src') delete this.src; }
        querySelectorAll() { return []; }
        closest() { return null; }
        scrollIntoView() {}
        focus() { document.activeElement = this; }
        contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    }
    const $ = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
    const document = new Element('document');
    Object.assign(document, {getElementById:$, createElement:tag => new Element(tag), createDocumentFragment:() => new Element('fragment'), activeElement:null});
    const context = {
        document, Intl, AbortController, console,
        localStorage:{getItem(){if(storageUnavailable) throw Error('blocked'); return savedPosition;}, setItem(key, value){if(storageUnavailable) throw Error('blocked'); stored[key] = value;}},
        URL:{createObjectURL(file){const url = 'blob:' + urls.length; urls.push({url,file}); return url;}, revokeObjectURL:url => revoked.push(url)},
        IntersectionObserver:class {constructor(callback){this.callback=callback; this.targets=[]; observers.push(this);} observe(el){this.targets.push(el);} disconnect(){this.disconnected=true;}},
        FormData:class {constructor(){this.parts={};} append(key, value){this.parts[key]=value;}},
        fetch(url, options){return new Promise((resolve,reject) => requests.push({url,options,resolve,reject}));},
        escHtml:s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;'), formatSize:n => String(n)
    };
    context.window = context;
    vm.runInNewContext(script, context);
    function choose(files) { $('viewerFolder').files=files; $('viewerFolder').emit('change'); }
    function single(file) { $('viewerFile').files=[file]; $('viewerFile').emit('change'); }
    return {$, requests, urls, revoked, observers, stored, document, choose, single};
}
const file = (name, relative = 'images/' + name) => ({name, size:100, webkitRelativePath:relative});
const settle = async () => { for (let i=0; i<10; i++) await Promise.resolve(); };
const response = name => ({ok:true, json:async () => ({parsed:{prompt:name},raw_meta:{parameters:name},info:{width:100,height:80}})});

test('folder filters formats, sorts names naturally and analyzes only the selected image', () => {
    const h = harness();
    h.choose([file('10.png'),file('2.PNG'),file('a.txt'),file('nested.webp','images/sub/nested.webp')]);
    assert.deepEqual(h.$('viewerStrip').children.map(b => b.title), ['images/2.PNG','images/10.png']);
    assert.equal(h.requests.length,1); assert.equal(h.requests[0].options.body.parts.file.name,'2.PNG');
    assert.equal(h.$('viewerCount').textContent,'1 / 2'); assert.equal(h.$('viewerPrevious').disabled,true);
    h.$('viewerStrip').children[1].click();
    assert.equal(h.$('viewerFileName').textContent,'images/10.png');
    assert.equal(h.$('viewerNext').disabled,true); assert.equal(h.$('viewerPrevious').disabled,false);
});

test('subfolders can be enabled while preserving the selected file', () => {
    const h = harness(); h.choose([file('one.png'),file('nested.webp','images/sub/nested.webp')]);
    h.$('viewerSubfolders').checked=true; h.$('viewerSubfolders').emit('change');
    assert.equal(h.$('viewerStrip').children.length,2); assert.equal(h.$('viewerCount').textContent,'1 / 2');
    h.$('viewerNext').click(); h.$('viewerSubfolders').checked=false; h.$('viewerSubfolders').emit('change');
    assert.equal(h.$('viewerFileName').textContent,'images/one.png'); assert.equal(h.$('viewerCount').textContent,'1 / 1');
});

test('empty supported-image selection clears the previous preview and supports nested-only folders', () => {
    const h = harness(); h.choose([file('one.png')]); h.choose([file('notes.txt')]);
    assert.equal(h.$('viewerPreview').classList.contains('visible'),false);
    assert.match(h.$('viewerNotice').textContent,/No PNG/); assert.equal(h.$('viewerCount').textContent,'0 images');
    assert.equal(h.$('viewerNext').disabled,true);
    h.choose([file('nested.png','images/sub/nested.png')]); assert.match(h.$('viewerNotice').textContent,/Enable Include subfolders/);
});

test('late metadata from an aborted request cannot overwrite the current image', async () => {
    const h = harness(); h.choose([file('one.png'),file('two.png')]); h.$('viewerNext').click();
    assert.equal(h.requests[0].options.signal.aborted,true);
    h.requests[1].resolve(response('new prompt')); await settle();
    h.requests[0].resolve(response('old prompt')); await settle();
    assert.match(h.$('viewerMeta').innerHTML,/new prompt/); assert.doesNotMatch(h.$('viewerMeta').innerHTML,/old prompt/);
});

test('late failures are ignored, active HTTP errors are shown, and browsing can recover', async () => {
    const h = harness(); h.choose([file('one.png'),file('two.png')]); h.$('viewerNext').click();
    h.requests[0].reject(Error('old error')); await settle(); assert.doesNotMatch(h.$('viewerMeta').innerHTML,/old error/);
    h.requests[1].resolve({ok:false,status:500,json:async () => ({error:'unreadable image'})}); await settle();
    assert.match(h.$('viewerMeta').innerHTML,/unreadable image/);
    h.$('viewerPrevious').click(); assert.match(h.$('viewerMeta').innerHTML,/Reading metadata/);
    h.requests[2].resolve(response('recovered')); await settle(); assert.match(h.$('viewerMeta').innerHTML,/recovered/);
});

test('thumbnails load on demand and release URLs when hidden or replaced', () => {
    const h = harness(); h.choose([file('one.png'),file('two.png')]);
    assert.equal(h.urls.length,1); // Main preview only; no batch upload or eager thumbnail decode.
    const observer=h.observers.at(-1), target=observer.targets[0];
    observer.callback([{target,isIntersecting:true}]); const thumbnailUrl=h.urls.at(-1).url;
    observer.callback([{target,isIntersecting:false}]); assert.ok(h.revoked.includes(thumbnailUrl));
    observer.callback([{target,isIntersecting:true}]); const oldUrls=h.urls.map(x=>x.url);
    h.choose([file('next.jpg')]);
    assert.equal(observer.disconnected,true); for(const url of oldUrls) assert.ok(h.revoked.includes(url));
    observer.callback([{target,isIntersecting:true}]); assert.equal(h.$('viewerStrip').children.length,1);
});

test('single-file opening leaves folder mode and permits choosing the same file again', () => {
    const h=harness(); h.choose([file('one.png'),file('two.png')]); const original=file('standalone.webp','');
    h.single(original); assert.equal(h.$('viewerFolderBar').hidden,true); assert.equal(h.$('viewerStrip').children.length,0);
    assert.equal(h.$('viewerFileName').textContent,'standalone.webp'); assert.equal(h.$('viewerFile').value,'');
    h.single(original); assert.equal(h.requests.length,3);
});

test('closing a folder invalidates pending responses and revokes preview URLs', async () => {
    const h=harness(); h.choose([file('one.png')]); const url=h.urls[0].url; h.$('viewerClear').click();
    assert.ok(h.revoked.includes(url)); assert.equal(h.requests[0].options.signal.aborted,true);
    h.requests[0].resolve(response('old')); await settle(); assert.equal(h.$('viewerMeta').innerHTML,'');
    assert.equal(h.$('viewerPreview').classList.contains('visible'),false);
});

test('position is remembered, invalid values fall back, and blocked storage does not break browsing', () => {
    const h=harness('right'); assert.equal(h.$('viewerWorkspace').dataset.position,'right');
    h.$('viewerPosition').value='left'; h.$('viewerPosition').emit('change');
    assert.equal(h.stored['cyberhub.viewer.thumbnailPosition'],'left');
    assert.equal(harness('invalid').$('viewerWorkspace').dataset.position,'top');
    const blocked=harness(null,true); blocked.choose([file('one.png')]); assert.equal(blocked.requests.length,1);
});

test('arrow keys navigate and focus thumbnails, but ignore editors, modifiers and text fields', () => {
    const h=harness(); h.choose([file('one.png'),file('two.png')]); h.$('viewerStrip').children[0].focus();
    h.document.emit('keydown',{key:'ArrowRight'}); assert.equal(h.$('viewerCount').textContent,'2 / 2');
    assert.equal(h.document.activeElement,h.$('viewerStrip').children[1]);
    h.document.emit('keydown',{key:'ArrowLeft',ctrlKey:true});
    h.document.emit('keydown',{key:'ArrowLeft',target:{closest:()=>({})}});
    h.$('metaEditModal').classList.add('open'); h.document.emit('keydown',{key:'ArrowLeft'});
    assert.equal(h.$('viewerCount').textContent,'2 / 2');
    h.$('metaEditModal').classList.remove('open'); h.document.emit('keydown',{key:'ArrowLeft'});
    assert.equal(h.$('viewerCount').textContent,'1 / 2');
});

test('broken preview feedback is cleared when the next image is selected', () => {
    const h=harness(); h.choose([file('broken.png'),file('next.jpg')]); h.$('viewerImg').emit('error');
    assert.equal(h.$('viewerImageError').hidden,false); assert.equal(h.$('viewerImg').hidden,true);
    h.$('viewerNext').click(); assert.equal(h.$('viewerImageError').hidden,true); assert.equal(h.$('viewerImg').hidden,false);
});

test('an empty directory clears the old image while chooser cancellation leaves it intact', () => {
    const h=harness(); h.choose([file('one.png')]); h.$('viewerFolder').emit('cancel');
    assert.equal(h.$('viewerFileName').textContent,'images/one.png');
    h.choose([]); assert.equal(h.$('viewerPreview').classList.contains('visible'),false);
    assert.equal(h.$('viewerFolderName').textContent,'Local folder'); assert.match(h.$('viewerNotice').textContent,/No PNG/);
});
