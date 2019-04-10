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

  it('pushes', () => {
    const bucket = new LeakyBucket(db, { collectionName: 'push-pop' });
    return bucket.push('Testing');
  });

  it('pops', () => {
    const bucket = new LeakyBucket(db, { collectionName: 'push-pop' });
    return bucket.pop()
      .then(res => assert(res === 'Testing'));
  });

  it('pushes and immediately pops', () => {
    const bucket = new LeakyBucket(db, { collectionName: 'push-pop' });
    return bucket.push('Testing immediate')
      .then(() => bucket.pop())
      .then(res => assert(res === 'Testing immediate'));
  });


  it('obeys interval', async () => {
    const bucket = new LeakyBucket(db, {
      collectionName: 'interval',
      interval: 100
    });

    await bucket.push('This should wait');
    const immediateRes = await bucket.pop();
    assert(immediateRes === undefined);

    await time(100);

    await bucket.push('This should fail');
    const delayedRes = await bucket.pop();
    assert(delayedRes === 'This should wait');
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
});


