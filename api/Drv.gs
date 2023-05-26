/**
/**
 * @class Drv
 * a wrapper for the Drive API
 * https://developers.google.com/drive/api/v3/reference
 */
class Drv {
  /**
   * @constructor
   * @param {function} tokenService a function that returns a cloud storage scoped access token
   * @return {Drv}
   */
  constructor({ tokenService, apiKey } = {}) {
    this.endpoint = "https://www.googleapis.com/drive/v3"
    this.uploadEndpoint = 'https://www.googleapis.com/upload/drive/v3/files'

    this.filepoint = '/files/:fileId'
    this.objectEndpoint = this.endpoint + this.filepoint
    this.listEndpoint = this.endpoint + '/files'
    this.createEndpoint = this.endpoint + '/files'
    this.aboutEndpoint = this.endpoint + '/about'

    this.tokenService = tokenService 
    this.defaultFields = 'id,size,name,mimeType,md5Checksum,kind,parents'
    this.defaultAboutFields = 'importFormats,exportFormats,kind'
    this.defaultMimeType = "application/pdf",
    this.apiKey = apiKey
    this.defaultParams = apiKey ? {key: apiKey} : null
  }
  /*
      The MIME type to convert to. For most blobs, 'application/pdf' is the only valid option. For images in BMP, GIF, JPEG, or PNG format, any of 'image/bmp', 'image/gif', 'image/jpeg', or 'image/png' are also valid.
      https://developers.google.com/drive/api/guides/ref-export-formats
  */

  /**
   * info about the drive service
   * https://www.googleapis.com/drive/v3/about
   * @param {object} p
   * @param {boolean} [p.noisy] whether to log
   * @param {boolean} [p.throwOnError] whether to throw on error
   * @param {boolean} [p.noCache] whether to skip caching
   * @return {FetchResponse} the file content
   */

  /**
   * were after how files can be imported and treated - for example
   * importFormats: [items]
   * this item says that  the mimetype property can be imported as any in the array
   *    { 'application/x-vnd.oasis.opendocument.presentation': [ 'application/vnd.google-apps.presentation' ] }
   * exportFormats: [items]
   * this item says that  the mimetype property can be exported as any in the array
   * 'application/vnd.google-apps.document': 
      [ 'application/rtf',
        'application/vnd.oasis.opendocument.text',
        'text/html',
        'application/pdf',
        'application/epub+zip',
        'application/zip',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain' ],
   * 
   */

  about({ noisy, noCache, throwOnError }, ...params) {

    const fetcher = this._plainFetcher(this.aboutEndpoint)
    return fetcher.fetch({
      noCache,
      noisy,
      throwOnError
    },
      // you could make this recursive by allowing 
      // folders and adding theor content too.
      ...params.concat([{ fields: this.defaultAboutFields }]))
  }

  /**
   * @param {object} file metadata
   * @return {boolean} whether a file is a file (not a folder)
   */
  isFolder(file) {
    return file.mimeType === this.folderMimeType
  }

  /**
   * mimetype of a folder
   * @return {string}
   */
  get folderMimeType() {
    return 'application/vnd.google-apps.folder'
  }

  /**
   * create a file with just metadata
   * @param {object} meta
   * @return {PackResponse} 
   */
  create({ metadata, noisy, throwOnError }, ...params) {
    const fetcher = this._plainFetcher(this.createEndpoint)
    const options = {
      method: "POST",
      payload: JSON.stringify(metadata),
      contentType: 'application/json',
    }
    return fetcher.fetch({ noisy, options, throwOnError },
      ...params.concat([{ mimeType, fields: this.defaultFields }]))
  }

  /**
   * create a folder
   */
  createFolder({ name, throwOnError = true, noisy, parentId = 'root' }) {
    return this.create({
      noisy,
      throwOnError,
      metadata: {
        name,
        mimeType: this.folderMimeType,
        parents: [parentId]
      }
    })
  }

  /**
   * delete a file
   */
  delete({ noisy, id }) {
    const fetcher = this._fileFetcher(id)
    return fetcher.fetch({
      options: {
        method: 'DELETE'
      }, noisy
    })
  }

  getTempName() {
    return `__canbedeleted__`
  }

  copy ({ id, noisy, throwOnError }, ...params) {
    const fetcher = this._fileFetcher (id)
    return fetcher.fetch ({
      path: '/copy',
      noisy,
      throwOnError,
      options: {
        method: "POST"
      }
    }, ...params)
  }

 

  /**
   * upload a file
   * @return {FetcherResponse}
   */
  upload({ blob, noisy, md5Name = true, throwOnError = true, mimeType, temp = true }, ...params) {


    const fetcher = this._plainFetcher(this.uploadEndpoint)

    // the name we'll write to storage cound be the md5
    const tempName = temp ? this.getTempName() : ''
    const name = tempName + (md5Name ? Exports.Utils.md5Checksum(blob) : blob.getName())
    if (noisy) console.log('..uploading', name)
    const metadata = temp ? { parents: ['appDataFolder'] } : null

    // the multipart boundary - could be anything
    const boundary = Exports.Utils.boundary()

    // make the multipart payload
    const payload = fetcher.makeMultiPart({
      name,
      blob,
      boundary,
      mimeType,
      metadata
    })

    // final options to upload data
    const options = {
      method: "POST",
      contentType: `multipart/related; boundary=${boundary}`,
      payload
    }

    // now do a multipart upload
    const upload = fetcher.fetch({ options, noisy, throwOnError },
      ...params.concat({ fields: this.defaultFields }))

    // inherit the blob
    upload.blob = blob
    return upload

  }


  /**
   * export a file
   * this applies to google files only
   * for other covnersions we need to get the blob and convert it
   * export file content by its id
   * @param {object} params
   * @param {string} params.id the file id
   * @param {string} [params.mimeType = this.defaultMimeType what to export as
   * @param {boolean} [params.noisy=false] whether to log
   * @param {boolean} [params.throwOnError] whether to throw on error
   * @param {boolean} [params.noCache] whether to skip caching
   * @return {FetchResponse} the file content
   */
  export({ id,
    mimeType = this.defaultMimeType,
    noisy = false,
    throwOnError,
    noCache
  }, ...params) {
    // first get the file metadata
    const metaResult = this.get({ id, noisy, throwOnError }, ...params)
    if (metaResult.error) return metaResult

    const fetcher = this._fileFetcher(id)
    const t = fetcher.fetch({
      path: '/export',
      noCache,
      noisy,
      throwOnError
    },
      ...params.concat([{ mimeType }]))


    if (t.error) return t

    // pass meta result of original file
    // exported data will be in the blob property
    if (t.data) {
      t.error = 'unexpected item in data area'

    } else {
      t.data = metaResult.data
      // set the blobname
      const ext = t.blob.getName().replace(/.*(\..*)$/, "$1")
      t.blob.setName(metaResult.data.name + ext)

    }

    return t
  }

  _plainFetcher(endpoint) {
    return Exports.newFetch({
      endpoint,
      tokenService: this.tokenService,
      defaultParams: this.defaultParams
    })
  }

  _fileFetcher(id) {
    if (Exports.Utils.isNU(id)) throw 'drive get id cannot be null or undefined'
    return this._plainFetcher(this.objectEndpoint.replace(':fileId', id))
  }


  /**
   * download a file
   * note  - this is not a multipart or resumable download
   * files for this use case will be fairly small
   * @param {object} params
   * @param {string} params.id the file id
   * @param {string} [params.download = false] whether to get a blob of the content
   * @param {boolean} [params.noisy=false] whether to log
   * @param {boolean} [params.throwOnError] whether to throw on error
   * @param {boolean} [params.noCache] whether to skip caching
   * @return {FetchResponse} the file content
   */
  download({ id, noisy = false, noCache = false, throwOnError }, ...params) {

    const t = this.get({ id, noisy, noCache, throwOnError, download: true }, ...params)
    if (t.error) return t

    // now do the download 
    const result = this._fileFetcher(t.data.id).fetch({
      noCache,
      noisy,
      throwOnError
    },
      ...params.concat([{ alt: 'media' }]))

    // inherit the metadata
    result.data = t.data
    return result

  }

  /**
   * get a file
   * note  - this is not a multipart or resumable download
   * files for this use case will be fairly small
   * @param {object} params
   * @param {string} params.id the file id
   * @param {boolean} [params.noisy=false] whether to log
   * @param {boolean} [params.throwOnError] whether to throw on error
   * @param {boolean} [params.noCache] whether to skip caching
   * @return {FetchResponse} the file content
   */
  get({ id, noisy = false, noCache = false, throwOnError }, ...params) {
    const u = Exports.Utils
    return this._fileFetcher(id).fetch({
      noCache,
      noisy,
      throwOnError
    },
      ...params.concat([{ fields: this.defaultFields }]))
  }

  list({ id, noCache, noisy, throwOnError }, ...params) {

    if (Exports.Utils.isNU(id)) throw 'folder list id cannot be null or undefined'
    const fetcher = this._plainFetcher(this.listEndpoint)

    return fetcher.fetch({
      noCache,
      noisy,
      throwOnError
    },
      // you could make this recursive by allowing folders and adding theor content too.
      ...params.concat([{ q: `'${id}' in parents and trashed = false` }]))

  }

}






