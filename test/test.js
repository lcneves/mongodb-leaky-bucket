'use strict';

const assert = require('assert');
const MongoMemory = require('mongodb-memory-server').MongoMemoryServer;
const MongoClient = require('mongodb').MongoClient;
const LeakyBucket = require('..');

describe('Leaky bucket tests', () => {
  let db;

  function time (t) {
    return new Promise(resolve => {
      setTimeout(() => resolve(), t);
    });
  }

  before(done => {
    const mongoServer = new MongoMemory();
    assert(mongoServer instanceof MongoMemory);

    mongoServer.getConnectionString()
      .then(dbUrl => MongoClient.connect(dbUrl, { useNewUrlParser: true }))
      .then(client => {
        db = client.db('leaky-bucket-test');
        done();
      })
      .catch(err => done(err));
  });

  it('instantiates', () => {
    const bucket = new LeakyBucket(db);
    assert(bucket instanceof LeakyBucket);
  });

  it('primes', () => {
    const bucket = new LeakyBucket(db);
    assert(bucket instanceof LeakyBucket);
    return bucket.prime();
  });

  it('pushes one payload', async () => {
    const bucket = new LeakyBucket(db, { collectionName: 'push-one' });
    const count = await bucket.push('Testing');
    assert(count === 1);
  });

  it('pushes and immediately shifts', () => {
    const bucket = new LeakyBucket(db, { collectionName: 'shift-one' });
    return bucket.push('Testing')
      .then(() => bucket.shift())
      .then(res => assert(res === 'Testing'));
  });

  it('pushes multiple payloads', async () => {
    const bucket = new LeakyBucket(db, { collectionName: 'push-multiple' });
    const countOne = await bucket.push('One', 'Two', 'Three');
    const countTwo = await bucket.push('Four', 'Five');
    assert(countOne === 3);
    assert(countTwo === 5);
  });

  it('pushes multiple payloads and immediately shifts', async () => {
    const bucket = new LeakyBucket(db, { collectionName: 'shift-multiple' });
    await bucket.push('One');
    await bucket.push('Two', 'Three', 'Four');
    await bucket.push('Five');
    const resOne = await bucket.shift();
    const resTwo = await bucket.shift();
    const resThree = await bucket.shift();
    const resFour = await bucket.shift();
    const resFive = await bucket.shift();
    assert(resOne === 'One');
    assert(resTwo === 'Two');
    assert(resThree === 'Three');
    assert(resFour === 'Four');
    assert(resFive === 'Five');
  });

  it('unshifts', async () => {
    const bucket = new LeakyBucket(db, { collectionName: 'unshift' });
    await bucket.unshift('Five');
    await bucket.unshift('Two', 'Three', 'Four');
    const count = await bucket.unshift('One');
    assert(count === 5);

    const resOne = await bucket.shift();
    const resTwo = await bucket.shift();
    const resThree = await bucket.shift();
    const resFour = await bucket.shift();
    const resFive = await bucket.shift();
    assert(resOne === 'One');
    assert(resTwo === 'Two');
    assert(resThree === 'Three');
    assert(resFour === 'Four');
    assert(resFive === 'Five');
  });

  it('pops', async () => {
    const bucket = new LeakyBucket(db, { collectionName: 'pop' });
    await bucket.push('Three', 'Two', 'One');
    const resOne = await bucket.pop();
    const resTwo = await bucket.pop();
    const resThree = await bucket.pop();
    assert(resOne === 'One');
    assert(resTwo === 'Two');
    assert(resThree === 'Three');
  });

  it('returns undefined when shifted or popped empty', async () => {
    const bucket = new LeakyBucket(db, { collectionName: 'shift-empty' });
    await bucket.push('One');
    const resOne = await bucket.shift();
    const resShiftEmpty = await bucket.shift();
    const resPopEmpty = await bucket.pop();
    await bucket.push('Two');
    const resTwo = await bucket.shift();
    assert(resOne === 'One');
    assert(resTwo === 'Two');
    assert(resShiftEmpty === undefined);
    assert(resPopEmpty === undefined);
  });

  it('obeys interval', async () => {
    const bucket = new LeakyBucket(db, {
      collectionName: 'interval',
      interval: 100
    });

    await bucket.push(
      'This is immediately available',
      'This should wait',
      'This should wait too');

    const immediateResOne = await bucket.shift();
    const immediateResTwo = await bucket.shift();
    assert(immediateResOne === 'This is immediately available');
    assert(immediateResTwo === undefined);

    await time(100);

    const delayedResOne = await bucket.shift();
    const delayedResTwo = await bucket.pop();
    assert(delayedResOne === 'This should wait');
    assert(delayedResTwo === undefined);

    await time(100);

    const moreDelayedRes = await bucket.pop();
    assert(moreDelayedRes === 'This should wait too');
  });

  it('obeys limit for single inserts', async () => {
    const bucket = new LeakyBucket(db, {
      collectionName: 'limit-single',
      limit: 1
    });

    await bucket.push('Message 1');
    const firstRes = await bucket.shift();
    assert(firstRes === 'Message 1');

    await bucket.push('Message 2');

    try {
      await bucket.push('Overflow'); // Expect to fail
      throw new Error();
    } catch (err) {
      assert(err.message === 'Unable to push!');
    }

    try {
      await bucket.unshift('Overflow'); // Expect to fail
      throw new Error();
    } catch (err) {
      assert(err.message === 'Unable to push!');
    }
  });

  it('obeys limit for multiple inserts', async () => {
    const bucket = new LeakyBucket(db, {
      collectionName: 'limit-multiple',
      limit: 4
    });

    await bucket.push('Message 1');
    const countOne = await bucket.push('Message 2', 'Message 3');
    assert(countOne === 3);

    try {
      await bucket.push('Message 4', 'Overflow'); // Expect to fail
      throw new Error();
    } catch (err) {
      assert(err.message === 'Unable to push!');
    }

    try {
      await bucket.unshift('Message 4', 'Overflow'); // Expect to fail
      throw new Error();
    } catch (err) {
      assert(err.message === 'Unable to push!');
    }

    const firstRes = await bucket.shift();
    assert(firstRes === 'Message 1');

    const countTwo = await bucket.push('Message 4', 'Message 5');
    assert(countTwo === 4);
  });

  it('can refill after an overflow', async () => {
    const bucket = new LeakyBucket(db, {
      collectionName: 'refill',
      limit: 1
    });

    await bucket.push('Message 1');

    try {
      await bucket.push('Overflow'); // Expect to fail
      throw new Error();
    } catch (err) {
      assert(err.message === 'Unable to push!');
    }

    const firstRes = await bucket.shift();
    assert(firstRes === 'Message 1');

    await bucket.push('Message 2');
    const secondRes = await bucket.shift();
    assert(secondRes === 'Message 2');
  });

  it('works with two instances', async () => {
    const bucketOne = new LeakyBucket(db, { 'collectionName': 'two-insts' });
    await bucketOne.push('Message 1');

    const bucketTwo = new LeakyBucket(db, { 'collectionName': 'two-insts' });
    const firstRes = await bucketTwo.shift();
    assert(firstRes === 'Message 1');

    await bucketTwo.push('Message 2');
    const secondRes = await bucketOne.shift();
    assert(secondRes === 'Message 2');
  });

  it('accepts multiple JS data types as payload', async () => {
    const bucket = new LeakyBucket(db, { collectionName: 'types' });
    const count = await bucket.push(
      'a string',
      3.14159,
      null,
      true,
      [ 'zero', 1 ],
      { name: 'one complex object', prop: { arr: [ 1, [ 2, 3 ] ] } }
    );

    assert(count === 6);

    const str = await bucket.shift();
    assert(typeof str === 'string');

    const num = await bucket.shift();
    assert(typeof num === 'number');

    const nul = await bucket.shift();
    assert(nul === null);

    const boo = await bucket.shift();
    assert(typeof boo === 'boolean');

    const arr = await bucket.shift();
    assert(Array.isArray(arr));
    assert(typeof arr[0] === 'string');
    assert(typeof arr[1] === 'number');

    const obj = await bucket.shift();
    assert(typeof obj === 'object');
    assert(typeof obj.name === 'string');
    assert(typeof obj.prop === 'object');
    assert(Array.isArray(obj.prop.arr));
    assert(typeof obj.prop.arr[0] === 'number');
    assert(Array.isArray(obj.prop.arr[1]));
    assert(typeof obj.prop.arr[1][1] === 'number');
  });
});
