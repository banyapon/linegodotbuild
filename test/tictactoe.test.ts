import test from 'node:test';
import assert from 'node:assert/strict';
import { result, move, monsterMove } from '../game/tictactoe-rules.ts';
test('XO detects lines, full-board draw, and illegal occupied moves', () => {
  assert.equal(result(['X','X','X',null,null,null,null,null,null]), 'X');
  assert.equal(result(['O','X','X','X','O','O','O','X','X']), 'draw');
  assert.deepEqual(move(['X',null,null,null,null,null,null,null,null],0,'O'), ['X',null,null,null,null,null,null,null,null]);
});
test('monster takes a win, blocks a loss and stops on a completed board', () => {
  assert.equal(monsterMove(['O','O',null,'X','X',null,null,null,null]),2);
  assert.equal(monsterMove(['X','X',null,null,'O',null,null,null,null]),2);
  assert.equal(monsterMove(['X','X','X',null,'O','O',null,null,null]),-1);
});
