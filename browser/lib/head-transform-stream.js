import { Readable, Transform, pipeline } from 'stream';

export default class ReplaceInHeadTransform extends Transform {
  constructor(searchString, replaceString, options = {}) {
    super(options);
    this.searchString = searchString;
    this.replaceString = replaceString;
    this.headClosed = false;
  }

  _transform(chunk, encoding, callback) {
    const chunkStr = chunk.toString();
    if (this.headClosed) {
      this.push(chunkStr);
      callback();
      return;
    }

    const headCloseIndex = chunkStr.indexOf('</head>');
    let headPart = chunkStr;
    let remainingPart = '';
    if (headCloseIndex >= 0) {
      headPart = chunkStr.slice(0, headCloseIndex);
      remainingPart = chunkStr.slice(headCloseIndex);
      this.headClosed = true;
    }

    this.push(headPart.replaceAll(this.searchString, this.replaceString));
    remainingPart && this.push(remainingPart);
    callback();
  }
}

pipeline(
  Readable.from(['needle</head>needle']),
  new ReplaceInHeadTransform('needle', 'fire'),
  err => {
    if (err) {
      console.error('Pipeline failed.', err);
    } else {
      console.error('Pipeline succeeded.');
    }
  },
);
