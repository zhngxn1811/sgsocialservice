import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../public/render.js', import.meta.url), 'utf8');
const directory = JSON.parse(readFileSync(new URL('../public/services.json', import.meta.url), 'utf8'));

function setup() {
  const elements = new Map<string, any>();
  const get = (selector: string) => {
    if (!elements.has(selector)) elements.set(selector, {
      value: '', innerHTML: '', textContent: '', listeners: {},
      addEventListener(event: string, handler: Function) { this.listeners[event] = handler; },
      scrollIntoView() {},
    });
    return elements.get(selector);
  };
  const source = page.slice(page.indexOf('let CATS=[]'), page.indexOf('fetch("/api/services")'));
  runInNewContext(`${renderer}\nwindow={};\n${source}\nS=data.services;CATS=data.categories;renderGrid();`, {
    data: directory, URL, document: { querySelector: get }, window: undefined,
    setTimeout: () => 1, clearTimeout() {},
  });
  const search = (query: string) => {
    get('#q').value = query;
    get('#q').listeners.input();
  };
  return { get, search };
}

test('search updates listings with missing tags and clears back to six results', () => {
  const { get, search } = setup();
  const untagged = directory.services.find((s: any) => !s.tags);
  assert.ok(untagged, 'exercise the optional tags field in the real directory');
  search(untagged.name.toUpperCase());
  assert.ok(get('#grid').innerHTML.includes(untagged.name));
  assert.match(get('#count').textContent, /matching services/);
  search('no-such-service-xyz');
  assert.match(get('#grid').innerHTML, /Nothing matches/);
  assert.equal(get('#directoryPages').hidden, true);
  search('');
  assert.equal((get('#grid').innerHTML.match(/<article /g) || []).length, 6);
  assert.equal(get('#pageStatus').textContent, `Page 1 of ${Math.ceil(directory.services.length / 6)}`);
});

test('search resets pagination and combines with category filters', () => {
  const { get, search } = setup();
  get('#nextPage').listeners.click();
  assert.match(get('#pageStatus').textContent, /^Page 2 /);
  search('  counselling  ');
  assert.match(get('#pageStatus').textContent, /^Page 1 /);
  assert.ok((get('#grid').innerHTML.match(/<article /g) || []).length <= 6);
  const cat = directory.services.find((s: any) => !s.tags).cats[0];
  get('#cats').listeners.click({ target: { closest: () => ({ dataset: { cat } }) } });
  const expected = directory.services.filter((s: any) => s.cats.includes(cat) &&
    [s.name, s.org, s.desc, s.address, s.other, ...(s.tags || [])].join(' ').toLowerCase().includes('counselling'));
  assert.equal((get('#grid').innerHTML.match(/<article /g) || []).length, Math.min(6, expected.length));
});

test('the LGBTQ+ filter includes new and existing support services', () => {
  const { get, search } = setup();
  get('#cats').listeners.click({ target: { closest: () => ({ dataset: { cat: 'lgbtq' } }) } });
  assert.match(get('#cats').innerHTML, /data-cat="lgbtq" aria-pressed="true">LGBTQ\+/);
  for (const name of ['Oogachaga', 'Brave Spaces Helpline', 'TransBefrienders', 'Heartscape Psychology']) {
    search(name);
    assert.match(get('#count').textContent, /1–1 of 1 matching services/);
    assert.ok(get('#grid').innerHTML.includes(name));
  }
  search('Samaritans of Singapore');
  assert.match(get('#grid').innerHTML, /Nothing matches/);
});
