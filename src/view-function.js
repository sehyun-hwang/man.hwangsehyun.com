/* global emit */
/* eslint-disable func-names */
/* eslint-disable no-underscore-dangle */

const frontmatterMapFunction = function (doc) {
  if (doc.item.type === -'content') {
    emit([doc._id, 0], doc.item);
    emit([doc._id, 1], {
      _id: 'frontmatter.' + doc.item.hash,
    });
  }
};

// eslint-disable-next-line import/prefer-default-export
export const frontmatterMap = frontmatterMapFunction.toString();
