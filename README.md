# mongodb-leaky-bucket
A [leaky bucket](https://en.wikipedia.org/wiki/Leaky_bucket) queue/deque backed by MongoDB.

## Uses
May be used to throttle queries to expensive resources such as email or file servers.

The same queue can be accessed by multiple NodeJS servers connected to a database, provided that the same instance options are passed and that their clocks are synchronized.

## Installation

```
$ npm install mongodb-leaky-bucket --save
```

## Usage

```javascript
const LeakyBucket = require('mongodb-leaky-bucket');

const bucket = new LeakyBucket(db, {
  collectionName: 'my-bucket', // MongoDB collection to use
  interval: 500,               // Allows one dequeue op each 500ms
  limit: 200                   // Maximum elements in bucket
});

bucket.push('Element one', 'Element two', 'Element three')
  .then(queueLength => console.log(queueLength)); // 3

bucket.shift()
  .then(element => console.dir(element)); // 'Element one'
bucket.shift()
  .then(element => console.dir(element)); // undefined

// a second later
bucket.shift()
  .then(element => console.dir(element)); // 'Element two'
bucket.shift()
  .then(element => console.dir(element)); // undefined

// another 500ms later
bucket.shift()
  .then(element => console.dir(element)); // 'Element three'
```

## API

### new LeakyBucket(db, [options])
Returns a new LeakyBucket deque.

#### db _[MongoDB 'Db' instance]_
A collection in this database will be used to store the deque.

#### options _[Object]_
`collectionName` _[String]_: Name of the mongodb collection to use. Default: `leaky-bucket-default`.

`interval` _[Number]_: Minimum time, in milliseconds, between dequeue operations. Default: `0`.

`limit` _[Integer]_: Maximum number of elements that the deque will store before refusing an enqueue operation. Default: `2147483648` (2^31).

### bucket.push(elementOne[, ...[, elementN]])
Appends the parameter(s) to the queue. Returns a Promise with the new length of the queue. Will reject if operation would cause an overflow of the bucket's limit.

### bucket.shift()
Dequeues the first element of the queue and returns a Promise containing this element. If the queue is empty or if the time passed since the last dequeuing operation is less than `options.interval`, operation does not alter the queue and returns `undefined`.

### bucket.unshift(elementOne[, ...[, elementN]])
Same as `push`, but prepends to queue instead of appending.

### bucket.pop()
Same as `shift`, but dequeues and retrieves the last element instead of the first.

## Disclaimer
This project is not affiliated with MongoDB.

## License
MIT
