/*
 * mongo-leaky-bucket
 * Copyright 2019 Lucas Neves <lcneves@gmail.com>
 *
 * A queue with throttling capabilities backed by MongoDB.
 */

'use strict';

class LeakyBucket {
  constructor (db, options={}) {
    if (!options || typeof options !== 'object')
      throw new Error('Options, if passed, must be an object!');

    const collectionName = options.collectionName || 'leaky-bucket-default';

    this.collection = db.collection(collectionName);
    this.interval = options.interval || 0;
    this.limit = options.limit || 2147483648; // 2^31, for safety
    this.queue = [];
    this.isPrimed = false;
  }

  prime () {
    const self = this;
    return new Promise((resolve, reject) => {
      if (self.isPrimed)
        return resolve();

      self.collection.createIndex({ lbUniqueProperty: 1 }, { unique: true })
        .then(() => self.collection.insertOne({
          lbUniqueProperty: 1,
          count: 0,
          queue: [],
          timestamp: new Date()
        }))
        .catch(err => {
          if (err.toString().includes('E11000'))
            return;

          throw err;
        })
        .then(() => {
          self.isPrimed = true;
          resolve();
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  push (...payloads) {
    const self = this;
    return new Promise((resolve, reject) => {
      self.prime()
        .then(() => self.collection.findOneAndUpdate({
          lbUniqueProperty: 1,
          count: { '$lt': self.limit }
        }, {
          '$push': { queue: { '$each': payloads } },
          '$inc': { count: payloads.length }
        }))
        .then(res => {
          if (res.ok === 1 && res.value && res.value.lbUniqueProperty === 1)
            resolve();
          else
            reject(new Error('Unable to push!'));
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  pop () {
    const self = this;
    return new Promise((resolve, reject) => {
      self.prime()
        .then(() => {
          const now = new Date();

          return self.collection.findOneAndUpdate({
            lbUniqueProperty: 1,
            timestamp: { '$lte': new Date(now.getTime() - self.interval) },
            count: { '$gt': 0 }
          }, {
            '$set': { timestamp: now },
            '$pop': { queue: -1 },
            '$inc': { count: -1 }
          });
        })
        .then(res => {
          if (res && res.value && Array.isArray(res.value.queue))
            resolve(res.value.queue[0]);
          else
            resolve(undefined);
        })
        .catch(err => {
          reject(err);
        });
    });
  }
}

module.exports = LeakyBucket;
