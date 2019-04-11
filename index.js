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

  _add (isUnshift, ...payloads) {
    const self = this;
    return new Promise((resolve, reject) => {
      const pushOper = { '$each': payloads };
      if (isUnshift)
        pushOper['$position'] = 0;

      self.prime()
        .then(() => self.collection.findOneAndUpdate({
          lbUniqueProperty: 1,
          count: { '$lt': self.limit }
        }, {
          '$push': { queue: pushOper },
          '$inc': { count: payloads.length }
        }, {
          returnOriginal: false
        }))
        .then(res => {
          if (res.ok === 1 && res.value && res.value.lbUniqueProperty === 1)
            resolve(res.value.count);
          else
            reject(new Error('Unable to push!'));
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  push (...payloads) {
    return this._add(false, ...payloads);
  }

  unshift (...payloads) {
    return this._add(true, ...payloads);
  }

  _retrieve (isPop) {
    const self = this;
    return new Promise((resolve, reject) => {
      const popParam = isPop ? 1 : -1;

      self.prime()
        .then(() => {
          const now = new Date();

          return self.collection.findOneAndUpdate({
            lbUniqueProperty: 1,
            timestamp: { '$lte': new Date(now.getTime() - self.interval) },
            count: { '$gt': 0 }
          }, {
            '$set': { timestamp: now },
            '$pop': { queue: popParam },
            '$inc': { count: -1 }
          });
        })
        .then(res => {
          if (res && res.value && Array.isArray(res.value.queue)) {
            const index = isPop ? res.value.queue.length - 1 : 0;
            resolve(res.value.queue[index]);
          }
          else
            resolve(undefined);
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  shift () {
    return this._retrieve(false);
  }

  pop () {
    return this._retrieve(true);
  }
}

module.exports = LeakyBucket;
