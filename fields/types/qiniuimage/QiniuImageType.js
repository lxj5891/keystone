/*!
 * Module dependencies.
 */

var _ = require('underscore'),
  keystone = require('../../../'),
  util = require('util'),
  qiniu = require('qiniu'),
  MPromise = require('mpromise'),
  utils = require('keystone-utils'),
  super_ = require('../Type'),
  url = require('url'),
  sizeOf = require('image-size');

/**
 * QiniuImage FieldType Constructor
 * @extends Field
 * @api public
 */

function qiniuimage(list, path, options) {

  this._underscoreMethods = ['format'];
  this._fixedSize = 'full';
  this._properties = ['prefix', 'select', 'selectPrefix', 'autoCleanup', 'publicID', 'bucket', 'filenameAsPublicID'];

  if (!options.bucket) {
    throw new Error(
      'Invalid Configuration\n\n' +
      'QiniuImage fields (' + list.key + '.' + path + ') MUST have `bucket` option.\n'
    );
  }

  // TODO: implement filtering, usage disabled for now
  options.nofilter = true;

  // TODO: implement initial form, usage disabled for now
  if (options.initial) {
    throw new Error(
      'Invalid Configuration\n\n' +
      'QiniuImage fields (' + list.key + '.' + path + ') do not currently support being used as initial fields.\n'
    );
  }

  qiniuimage.super_.call(this, list, path, options);

  // validate qiniu config
  if (!keystone.get('qiniu config')) {
    throw new Error(
      'Invalid Configuration  QiniuImage fields (' + list.key + '.' + this.path + ')'
    );
  }
}

/*!
 * Inherit from Field
 */

util.inherits(qiniuimage, super_);


/**
 * Registers the field on the List's Mongoose Schema.
 *
 * @api public
 */

qiniuimage.prototype.addToSchema = function() {

  var field = this,
    schema = this.list.schema;

  var paths = this.paths = {
    // qiniu fields
    public_id:    this._path.append('.public_id'),
    version:    this._path.append('.version'),
    signature:    this._path.append('.signature'),
    format:     this._path.append('.format'),
    resource_type:  this._path.append('.resource_type'),
    url:      this._path.append('.url'),
    width:      this._path.append('.width'),
    height:     this._path.append('.height'),
    secure_url:   this._path.append('.secure_url'),
    // virtuals
    exists:     this._path.append('.exists'),
    bucket:     this._path.append('.bucket'),
    // form paths
    upload:     this._path.append('_upload'),
    action:     this._path.append('_action'),
    select:     this._path.append('_select')
  };

  var schemaPaths = this._path.addTo({}, {
    public_id:     String,
    version:       Number,
    originalname:  String,
    extension:     String,
    hash:          String,
    format:        String,
    mimetype:      String,
    width:         Number,
    height:        Number,
    size:          Number,
    url:           String,
    thumb_url:     String,
    secure_url:    String,
    secure_thumb_url: String,
  });

  schema.add(schemaPaths);

  var exists = function(item) {
    return (item.get(paths.public_id) ? true : false);
  };

  // The .exists virtual indicates whether an image is stored
  schema.virtual(paths.exists).get(function() {
    return schemaMethods.exists.apply(this);
  });

  // The .bucket virtual returns the qiniu bucket used to upload/select images
  schema.virtual(paths.bucket).get(function() {
    return schemaMethods.bucket.apply(this);
  });

  var src = function(item, options) {

    if (!exists(item)) {
      return '';
    }

    options = ('object' === typeof options) ? options : {};

    if (!('fetch_format' in options) && keystone.get('qiniu webp') !== false) {
      options.fetch_format = 'auto';
    }

    if (!('progressive' in options) && keystone.get('qiniu progressive') !== false) {
      options.progressive = true;
    }

    if (!('secure' in options) && keystone.get('qiniu secure')) {
      options.secure = true;
    }

    options.version = item.get(paths.version);

    return qiniu.url(item.get(paths.public_id) + '.' + item.get(paths.format), options);

  };

  var reset = function(item) {
    item.set(field.path, {
      public_id: '',
      version: 0,
      originalname: '',
      extension: '',
      hash: '',
      format: '',
      mimetype: '',
      width: 0,
      height: 0,
      size: 0,
      url: '',
      thumb_url: '',
      secure_url: '',
      secure_thumb_url: ''
    });
  };

  var addSize = function(options, width, height, other) {
    if (width) options.width = width;
    if (height) options.height = height;
    if ('object' === typeof other) {
      _.extend(options, other);
    }
    return options;
  };

  var schemaMethods = {
    exists: function() {
      return exists(this);
    },
    bucket: function() {
      return field.options.bucket;
    },
    prefix: function() {
      return field.options.prefix;
    },
    src: function(options) {
      return src(this, options);
    },
    /**
     * Resets the value of the field
     *
     * @api public
     */
    reset: function() {
      reset(this);
    },
    /**
     * Deletes the image from qiniu and resets the field
     *
     * @api public
     */
    delete: function() {
      var promise = new MPromise();

      var config = keystone.get('qiniu config');
      qiniu.conf.ACCESS_KEY = config.access_key;
      qiniu.conf.SECRET_KEY = config.secret_key;

      var bucketName = field.options.bucket;
      var fileName = this.get(paths.public_id);
      var client = new qiniu.rs.Client();
      client.remove(bucketName, fileName, function(err, result) {
        if (err && err.code !== 612) {
          promise.reject(err);
        } else {
          promise.fulfill(result);
        }
      });

      reset(this);

      return promise;
    },
    /**
     * Uploads the image to qiniu
     *
     * @api public
     */
    upload: function(file, options) {
      var promise = new MPromise();

      var config = keystone.get('qiniu config');
      qiniu.conf.ACCESS_KEY = config.access_key;
      qiniu.conf.SECRET_KEY = config.secret_key;

      var bucketName = field.options.bucket;
      var fileName = options.public_id;

      var putPolicy = new qiniu.rs.PutPolicy();
      putPolicy.scope = bucketName + ':' + fileName;
      var token = putPolicy.token();

      var params = {
        originalname: options.originalname
      };
      var putExtra = new qiniu.io.PutExtra(params);
      if (options.mimetype) {
        putExtra.mimeType = options.mimetype;
      }
      putExtra.check_crc = check_crc = 1; // check crc (local vs. remote)
      qiniu.io.putFile(token, fileName, file, putExtra, function(err, result) {
        if (err) {
          promise.reject(result);
        } else {
          promise.fulfill(result);
        }
      });

      return promise;
    }
  };

  _.each(schemaMethods, function(fn, key) {
    field.underscoreMethod(key, fn);
  });

  // expose a method on the field to call schema methods
  this.apply = function(item, method) {
    return schemaMethods[method].apply(item, Array.prototype.slice.call(arguments, 2));
  };

  this.bindUnderscoreMethods();
};


/**
 * Formats the field value
 *
 * @api public
 */

qiniuimage.prototype.format = function(item) {

	if (!item.get(this.paths.url)) return '';
	
	if ('function' === typeof this.options.format) {
		return this.options.format.call(this, item, this.paths.url);
	}
	
  return item.get(this.paths.url);
};


/**
 * Detects whether the field has been modified
 *
 * @api public
 */

qiniuimage.prototype.isModified = function(item) {
  return item.isModified(this.paths.url);
};


/**
 * Validates that a value for this field has been provided in a data object
 *
 * @api public
 */

qiniuimage.prototype.validateInput = function(data) {//eslint-disable-line no-unused-vars
  // TODO - how should image field input be validated?
  return true;
};


/**
 * Updates the value for this field in the item from a data object
 *
 * @api public
 */

qiniuimage.prototype.updateItem = function(item, data) {
  var paths = this.paths;

  var setValue = function(key) {
    if (paths[key]) {
      var index = paths[key].indexOf('.');
      var field = paths[key].substr(0, index);
      // Note we allow implicit conversion here so that numbers submitted as strings in the data object
      // aren't treated as different values to the stored Number values
      if (data[field] && data[field][key] && data[field][key] != item.get(paths[key])) { // eslint-disable-line eqeqeq
        item.set(paths[key], data[field][key] || null);
      }
    }
  };

  _.each([
    'public_id',
    'version',
    'originalname',
    'extension',
    'hash',
    'format',
    'mimetype',
    'width',
    'height',
    'size',
    'url',
    'thumb_url',
    'secure_url',
    'secure_thumb_url'
  ], setValue);
};


/**
 * Returns a callback that handles a standard form submission for the field
 *
 * Expected form parts are
 * - `field.paths.action` in `req.body` (`clear` or `delete`)
 * - `field.paths.upload` in `req.files` (uploads the image to qiniu)
 *
 * @api public
 */

qiniuimage.prototype.getRequestHandler = function(item, req, paths, callback) {

  var field = this;

  if (utils.isFunction(paths)) {
    callback = paths;
    paths = field.paths;
  } else if (!paths) {
    paths = field.paths;
  }

  callback = callback || function() {};

  return function() {

    if (req.body) {
      var action = req.body[paths.action];

      if (/^(delete|reset)$/.test(action)) {
        field.apply(item, action);
      }
    }

    if (req.files && req.files[paths.upload] && req.files[paths.upload].size) {
      var prefix = field.options.prefix || '';
      var imageDelete;

      if (prefix.length) {
        prefix += '_';
      }
      
      var uploadOptions = {};
      var fileInfo = req.files[paths.upload];

      if (field.options.publicID) {
        // using the value from another filed as image id
        var publicIdValue = item.get(field.options.publicID);
        if (publicIdValue) {
          uploadOptions.public_id = publicIdValue;
        }
      } else if (field.options.filenameAsPublicID) {
        uploadOptions.public_id = fileInfo.originalname.substring(0, fileInfo.originalname.lastIndexOf('.'));
      } else {
        // default id(UUID) is generated by file uploader (multer)
        uploadOptions.public_id = req.files[paths.upload].name;
      }

      uploadOptions.public_id = prefix + uploadOptions.public_id;
      uploadOptions.originalname = fileInfo.originalname;
      uploadOptions.mimetype = fileInfo.mimetype;

      if (field.options.autoCleanup && item.get(field.paths.exists)) {
        // capture image delete promise
        imageDelete = field.apply(item, 'delete');
      }

      // callback to be called upon completion of the 'upload' method
      var uploadComplete = function(result) {
        sizeOf(fileInfo.path, function(err, dimensions) {
          if (err) {
            callback(err);
          } else {
            var config = keystone.get('qiniu config');
            result.width = dimensions.width;
            result.height = dimensions.height;
            result.public_id = uploadOptions.public_id;
            result.originalname = fileInfo.originalname;
            result.extension = fileInfo.extension;
            result.mimetype = fileInfo.mimetype;
            result.size = fileInfo.size;
            result.url = url.resolve(config.host, uploadOptions.public_id);

            var imageView = new qiniu.fop.ImageView();
            imageView.width = 128;
            imageView.height = 128;
            result.thumb_url = imageView.makeRequest(result.url);
            if (config.secure_host) {
              result.secure_url = url.resolve(config.secure_host, uploadOptions.public_id);
              result.secure_thumb_url = imageView.makeRequest(result.secure_url);
            }
            item.set(field.path, result);
            callback();
          }
        });
      };

      // field.apply(item, 'upload', req.files[paths.upload].path, uploadOptions).onFulfill(uploadComplete);
      // upload immediately if image is not being delete
      if (typeof imageDelete === 'undefined') {
        field.apply(item, 'upload', req.files[paths.upload].path, uploadOptions)
        .then(uploadComplete)
        .catch(callback);
      } else {
        // otherwise wait until image is deleted before uploading
        // this avoids problems when deleting/uploading images with the same public_id (issue #598)
        imageDelete.then(function() {
          return field.apply(item, 'upload', req.files[paths.upload].path, uploadOptions).then(uploadComplete);
        })
        .catch(callback);
      }

    } else {
      callback();
    }

  };

};


/**
 * Immediately handles a standard form submission for the field (see `getRequestHandler()`)
 *
 * @api public
 */

qiniuimage.prototype.handleRequest = function(item, req, paths, callback) {
  this.getRequestHandler(item, req, paths, callback)();
};


/*!
 * Export class
 */

exports = module.exports = qiniuimage;
