'use strict';
// FR-020: a fila do relay guarda no máximo 1.000 eventos e descarta os mais antigos.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createQueue } = require('../scripts/relay.js');

test('fila cheia descarta os mais antigos', () => {
  const q = createQueue(1000);
  for (let i = 1; i <= 1005; i++) q.push({ n: i });
  assert.equal(q.length, 1000);
  assert.equal(q.peek().n, 6);
  assert.equal(q.dropped, 5);
});

test('fila mantém a ordem e esvazia', () => {
  const q = createQueue(3);
  q.push('a'); q.push('b');
  assert.equal(q.shift(), 'a');
  assert.equal(q.peek(), 'b');
  q.clear();
  assert.equal(q.length, 0);
});

test('carregar o módulo não liga o relay', () => {
  // se ligasse, este processo ficaria preso nos intervalos do relay
  const mod = require('../scripts/relay.js');
  assert.equal(typeof mod.createQueue, 'function');
});
