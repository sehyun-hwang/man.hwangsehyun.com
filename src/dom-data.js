// @ts-check

export default class StackEditDomData {
  constructor(docs) {
    this.docs = docs;
  }

  get files() {
    return this.docs.filter(({ item: { type } }) => type === 'file');
  }

  sortNodes() {
    const unsorted = this.docs.map(({ item }) => item);
    const sortedMap = new Map(
      unsorted.filter(({ parentId }) => !parentId).map(node => [node.id, node]),
    );

    do {
      unsorted.forEach(node => {
        if (sortedMap.has(node.id))
          return;
        sortedMap.has(node.parentId) && sortedMap.set(node.id, node);
      });
    } while (sortedMap.size !== unsorted.length);

    return sortedMap;
  }

  assignDocId(idCallback) {
    this.docs.filter(({ item: { type } }) => type === 'file')
      .forEach(({ _id, item: { id } }) => idCallback(_id, id));
  }
}
