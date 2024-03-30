/**
 * @typedef {{
 *   id: string,
 *   type: 'folder' | 'file' | 'content',
 *   hash: number | null,
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
