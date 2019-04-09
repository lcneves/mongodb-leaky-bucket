/*
 * mongo-throttled-queue
 * Copyright 2019 Lucas Neves <lcneves@gmail.com>
 *
 * A queue with throttling capabilities backed by MongoDB.
 */

'use strict';

class ThrottledQueue {
  constructor (collectionName, options={}) {
    if (!collectionName)
      throw new Error('Collection name must be provided!');

    if (typeof collectionName !== 'string')
      throw new Error('Collection name must be a string!');

    const params = {
      interval: 0,

  }
}
