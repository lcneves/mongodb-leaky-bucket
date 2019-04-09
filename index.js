/*
 * mongo-leaky-bucket
 * Copyright 2019 Lucas Neves <lcneves@gmail.com>
 *
 * A queue with throttling capabilities backed by MongoDB.
 */

'use strict';

class LeakyBucket {
  constructor (db, options={}) {
    if (!collectionName)
      throw new Error('Collection name must be provided!');

    if (typeof collectionName !== 'string')
      throw new Error('Collection name must be a string!');

    if (!options || typeof options !== 'object')
      throw new Error('Options, if passed, must be an object!');

    const collectionName = options.collectionName || 'leaky-bucket-default';

    this.collection = db.collection(collectionName);
    this.interval = options.interval || 0;
    this.maximum = options.maximum || 2147483648; // 2^31, for safety
    this.queue = [];
    this.isPrimed = false;
  }

  prime () {
    const self = this;
    return new Promise((resolve, reject) => {
      if (self.isPrimed)
        resolve();

      self.collection.ensureIndex({ lbUniqueProperty: 1 }, { unique: true })
        .then(() => self.collection.insertOne({
          lbUniqueProperty: 1,
          count: 0,
          queue: [],
          timestamp: new Date()
        }))
        .then(() => {
          self.isPrimed = true;
          resolve();
        })
        .catch(err => {
          console.dir(err);
          reject(err);
        });
    });
  }

  push (payload) {
    const self = this;
    return new Promise((resolve, reject) => {
      self.prime()
        .then(() => self.collection.findOneAndUpdate({
          lbUniqueProperty: 1,
          count: { '$lt': self.maximum }
        }, {
          '$push': { queue: payload },
          '$inc': { count: 1 }
        }))
        .then((res => {
          console.dir(res, { depth: null });
          resolve();
        })
        .catch(err => {
          console.dir(err);
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

          self.collection.findOneAndUpdate({
            lbUniqueProperty: 1,
            timestamp: { '$lte': new Date(now.getTime() + self.interval) },
            count: { '$gt': 0 }
          }, {
            '$set': { timestamp: now },
            '$pop': { queue: payload },
            '$inc': { count: -1 }
          });
        })
        .then(res => {
          console.dir(res, { depth: null });
          resolve(res);
        })
        .catch(err => {
          console.dir(err);
          reject(err);
        });
    });
  }
}
