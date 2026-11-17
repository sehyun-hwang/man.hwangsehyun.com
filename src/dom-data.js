// @ts-check

export default class StackEditDomData {
  /** @param {import('./types.js').StackEditDocument[]} docs */
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

    while (sortedMap.size !== unsorted.length) {
      const previousSize = sortedMap.size;
      unsorted.forEach(node => {
        if (sortedMap.has(node.id))
          return;
        if (node.parentId && sortedMap.has(node.parentId)) sortedMap.set(node.id, node);
      });
      if (sortedMap.size === previousSize) throw new Error('Orphaned or cyclic StackEdit nodes');
    }

    return sortedMap;
  }

  /** @param {(docId: string, itemId: string) => void} idCallback */
  assignDocId(idCallback) {
    this.docs.filter(({ item: { type } }) => type === 'file')
      .forEach(({ _id, item: { id } }) => idCallback(_id, id));
  }
}
