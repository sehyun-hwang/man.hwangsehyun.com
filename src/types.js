// @ts-check

/**
 *  @typedef { import('@ibm-cloud/cloudant').CloudantV1.Document } Document
 *  @typedef {import('@ibm-cloud/cloudant').CloudantV1.Attachment} Attachment
*/

/**
 * @typedef {{
 *   id: string,
 *   parentId: string | null,
 *   name: string,
 *   type: 'folder' | 'file' | 'content',
 *   hash: number,
 * }} StackEditItem
 */

/**
 * @typedef {StackEditItem & Document & {
 *   _id: string,
 *   item: StackEditItem,
*    _attachments: {
*      data: Attachment,
*    },
 * }} StackEditDocument
 */
