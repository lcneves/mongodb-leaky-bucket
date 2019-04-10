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

  it('pushes one payload', () => {
    const bucket = new LeakyBucket(db, { collectionName: 'push-one' });
    return bucket.push('Testing');
  });

  it('pushes and immediately pops', () => {
    const bucket = new LeakyBucket(db, { collectionName: 'pop-one' });
    return bucket.push('Testing')
      .then(() => bucket.pop())
      .then(res => assert(res === 'Testing'));
  });

  it('pushes multiple payloads', () => {
    const bucket = new LeakyBucket(db, { collectionName: 'push-multiple' });
    return bucket.push('One', 'Two', 'Three');
  });

  it('pushes multiple payloads and immediately pops', async () => {
    const bucket = new LeakyBucket(db, { collectionName: 'pop-multiple' });
    await bucket.push('One', 'Two', 'Three');
    const resOne = await bucket.pop();
    const resTwo = await bucket.pop();
    const resThree = await bucket.pop();
    assert(resOne === 'One');
    assert(resTwo === 'Two');
    assert(resThree === 'Three');
  });

  it('returns undefined when popped empty', async () => {
    const bucket = new LeakyBucket(db, { collectionName: 'pop-empty' });
    await bucket.push('One');
    const resOne = await bucket.pop();
    const resEmpty = await bucket.pop();
    await bucket.push('Two');
    const resTwo = await bucket.pop();
    assert(resOne === 'One');
    assert(resTwo === 'Two');
    assert(resEmpty === undefined);
  });

  it('obeys interval', async () => {
    const bucket = new LeakyBucket(db, {
      collectionName: 'interval',
      interval: 100
    });

    await bucket.push('This should wait', 'This should wait too');

    const immediateRes = await bucket.pop();
    assert(immediateRes === undefined);

    await time(100);

    const delayedRes = await bucket.pop();
    const immediateResTwo = await bucket.pop();
    assert(delayedRes === 'This should wait');
    assert(immediateResTwo === undefined);

    await time(100);

    const delayedResTwo = await bucket.pop();
    assert(delayedResTwo === 'This should wait too');
  });

  it('obeys limit', async () => {
    const bucket = new LeakyBucket(db, {
      collectionName: 'limit',
      limit: 1
    });

    await bucket.push('Message 1');
    const firstRes = await bucket.pop();
    assert(firstRes === 'Message 1');

    await bucket.push('Message 2');

    try {
      await bucket.push('Overflow');
    } catch (err) {
      assert(err.message === 'Unable to push!');
    }
  });

  it('can refill after an overflow', async () => {
    const bucket = new LeakyBucket(db, {
      collectionName: 'refill',
      limit: 1
    });

    await bucket.push('Message 1');

    try {
      await bucket.push('Overflow');
    } catch (err) {
      assert(err.message === 'Unable to push!');
    }

    const firstRes = await bucket.pop();
    assert(firstRes === 'Message 1');

    await bucket.push('Message 2');
    const secondRes = await bucket.pop();
    assert(secondRes === 'Message 2');
  });

  it('works with two instances', async () => {
    const bucketOne = new LeakyBucket(db, { 'collectionName': 'two-insts' });
    await bucketOne.push('Message 1');
    const bucketTwo = new LeakyBucket(db, { 'collectionName': 'two-insts' });
    const firstRes = await bucketTwo.pop();
    assert(firstRes === 'Message 1');

    await bucketTwo.push('Message 2');
    const secondRes = await bucketOne.pop();
    assert(secondRes === 'Message 2');
  });

  it('accepts multiple JS data types as payload', async () => {
    const bucket = new LeakyBucket(db, { collectionName: 'types' });
    await bucket.push(
      'a string',
      3.14159,
      null,
      true,
      [ 'zero', 1 ],
      { name: 'one complex object', prop: { arr: [ 1, [ 2, 3 ] ] } }
    );

    const str = await bucket.pop();
    assert(typeof str === 'string');

    const num = await bucket.pop();
    assert(typeof num === 'number');

    const nul = await bucket.pop();
    assert(nul === null);

    const boo = await bucket.pop();
    assert(typeof boo === 'boolean');

    const arr = await bucket.pop();
    assert(Array.isArray(arr));
    assert(typeof arr[0] === 'string');
    assert(typeof arr[1] === 'number');

    const obj = await bucket.pop();
    assert(typeof obj === 'object');
    assert(typeof obj.name === 'string');
    assert(typeof obj.prop === 'object');
    assert(Array.isArray(obj.prop.arr));
    assert(typeof obj.prop.arr[0] === 'number');
    assert(Array.isArray(obj.prop.arr[1]));
    assert(typeof obj.prop.arr[1][1] === 'number');
  });
});


