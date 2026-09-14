import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('memo board stays global and uses separate title and growing body fields',()=>{
 const component=read('app/memo-board.tsx');
 const workspace=read('app/workspace.tsx');
 const styles=read('app/memo-board.css');
 assert.match(workspace,/<MemoBoard\/>/);
 assert.doesNotMatch(component,/\bday\b/);
 assert.match(component,/className="memo-title"/);
 assert.match(component,/className="memo-body"/);
 assert.match(component,/scrollHeight/);
 assert.match(component,/setTimeout\(\(\)=>void save\(\),700\)/);
 assert.match(styles,/\.memo-title\{font-size:18px/);
 assert.match(styles,/\.memo-body\{font-size:16px/);
 assert.match(styles,/grid-template-columns:360px minmax\(0,1fr\) 320px/);
});
