/*!
 * Module dependencies.
 */

var _ = require('underscore'),
  keystone = require('../../../'),
  util = require('util'),
  cloudinary = require('cloudinary'),
  qiniu = require('qiniu'),
  MPromise = require('mpromise'),
  utils = require('keystone-utils'),
  super_ = require('../Type'),
  async = require('async')

  url = require('url'),
  sizeOf = require('image-size');


/**
 * QiniuImages FieldType Constructor
 * @extends Field
 * @api public
 */

function qiniuimages(list, path, options) {

  this._underscoreMethods = ['format'];
  this._fixedSize = 'full';
  this._properties = ['select', 'selectPrefix', 'autoCleanup', 'publicID', 'folder', 'filenameAsPublicID'];

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
    throw new Error('Invalid Configuration\n\n' +
      'QiniuImages fields (' + list.key + '.' + path + ') do not currently support being used as initial fields.\n');
  }

  qiniuimages.super_.call(this, list, path, options);

  // validate cloudinary config
  if (!keystone.get('cloudinary config')) {
    throw new Error('Invalid Configuration\n\n' +
      'QiniuImages fields (' + list.key + '.' + this.path + ') require the "cloudinary config" option to be set.\n\n' +
      'See http://keystonejs.com/docs/configuration/#services-cloudinary for more information.\n');
  }

}

/*!
 * Inherit from Field
 */

util.inherits(qiniuimages, super_);


/**
 * Registers the field on the List's Mongoose Schema.
 *
 * @api public
 */

qiniuimages.prototype.addToSchema = function() {

  var mongoose = keystone.mongoose;

  var field = this,
      schema = this.list.schema;

  this.paths = {
    // virtuals
    folder:     this._path.append('.folder'),
    // form paths
    upload:     this._path.append('_upload'),
    uploads:    this._path.append('_uploads'),
    action:     this._path.append('_action'),
    order:      this._path.append('_order')
  };

  var ImageSchema = new mongoose.Schema({
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
    secure_thumb_url: String
  });

  // Generate cloudinary folder used to upload/select images
  var folder = function(item) {//eslint-disable-line no-unused-vars
    var folderValue = '';

    if (keystone.get('cloudinary folders')) {
      if (field.options.folder) {
        folderValue = field.options.folder;
      } else {
        var folderList = keystone.get('cloudinary prefix') ? [keystone.get('cloudinary prefix')] : [];
        folderList.push(field.list.path);
        folderList.push(field.path);
        folderValue = folderList.join('/');
      }
    }

    return folderValue;
  };

  // The .folder virtual returns the cloudinary folder used to upload/select images
  schema.virtual(field.paths.folder).get(function() {
    return folder(this);
  });

  var src = function(img, options) {
    if (keystone.get('cloudinary secure')) {
      options = options || {};
      options.secure = true;
    }
    // 需要修改  获取修改  2
    return img.public_id ? cloudinary.url(img.public_id + '.' + img.format, options) : '';
  };

  var addSize = function(options, width, height) {
    if (width) options.width = width;
    if (height) options.height = height;
    return options;
  };

  ImageSchema.method('src', function(options) {
    return src(this, options);
  });

  ImageSchema.method('scale', function(width, height) {
    return src(this, addSize({ crop: 'scale' }, width, height));
  });

  ImageSchema.method('fill', function(width, height) {
    return src(this, addSize({ crop: 'fill', gravity: 'faces' }, width, height));
  });

  ImageSchema.method('lfill', function(width, height) {
    return src(this, addSize({ crop: 'lfill', gravity: 'faces' }, width, height));
  });

  ImageSchema.method('fit', function(width, height) {
    return src(this, addSize({ crop: 'fit' }, width, height));
  });

  ImageSchema.method('limit', function(width, height) {
    return src(this, addSize({ crop: 'limit' }, width, height));
  });

  ImageSchema.method('pad', function(width, height) {
    return src(this, addSize({ crop: 'pad' }, width, height));
  });

  ImageSchema.method('lpad', function(width, height) {
    return src(this, addSize({ crop: 'lpad' }, width, height));
  });

  ImageSchema.method('crop', function(width, height) {
    return src(this, addSize({ crop: 'crop', gravity: 'faces' }, width, height));
  });

  ImageSchema.method('thumbnail', function(width, height) {
    return src(this, addSize({ crop: 'thumb', gravity: 'faces' }, width, height));
  });

  schema.add(this._path.addTo({}, [ImageSchema]));

  this.removeImage = function(item, id, method, callback) {
    var images = item.get(field.path);
    if ('number' !== typeof id) {
      for (var i = 0; i < images.length; i++) {
        if (images[i].public_id === id) {
          id = i;
          break;
        }
      }
    }
    var img = images[id];
    if (!img) return;
    if (method === 'delete') {
      // 需要修改  删除图片 1
		var config = keystone.get('qiniu config');
		qiniu.conf.ACCESS_KEY = config.access_key;
		qiniu.conf.SECRET_KEY = config.secret_key;
	
		var bucketName = field.options.bucket;
		var client = new qiniu.rs.Client();
		
		client.remove(bucketName, img.public_id, function(err, result) {});
    }
    images.splice(id, 1);
    if (callback) {
      item.save(('function' !== typeof callback) ? callback : undefined);
    }
  };

  this.underscoreMethod('remove', function(id, callback) {
    field.removeImage(this, id, 'remove', callback);
  });

  this.underscoreMethod('delete', function(id, callback) {
    field.removeImage(this, id, 'delete', callback);
  });


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


  this.bindUnderscoreMethods();
};


/**
 * Formats the field value
 *
 * @api public
 */

qiniuimages.prototype.format = function(item) {

  if ('function' === typeof this.options.format) {
    var imgList = _.map(item.get(this.path), function(img) {
      return img.secure_url;
    });
    return this.options.format.call(this, imgList);
  }

  return _.map(item.get(this.path), function(img) {
    return img.src();
  }).join(', ');
};


/**
 * Detects whether the field has been modified
 *
 * @api public
 */

qiniuimages.prototype.isModified = function(item) {//eslint-disable-line no-unused-vars
  // TODO - how should this be detected?
  return true;
};


/**
 * Validates that a value for this field has been provided in a data object
 *
 * @api public
 */

qiniuimages.prototype.validateInput = function(data) {//eslint-disable-line no-unused-vars
  // TODO - how should image field input be validated?
  return true;
};


/**
 * Updates the value for this field in the item from a data object
 *
 * @api public
 */

qiniuimages.prototype.updateItem = function(item, data) {
  //eslint-disable-line no-unused-vars
  // TODO - direct updating of data (not via upload)
};


/**
 * Returns a callback that handles a standard form submission for the field
 *
 * Expected form parts are
 * - `field.paths.action` in `req.body` in syntax `delete:public_id,public_id|remove:public_id,public_id`
 * - `field.paths.upload` in `req.files` (uploads the images to cloudinary)
 *
 * @api public
 */

qiniuimages.prototype.getRequestHandler = function(item, req, paths, callback) {

  var field = this;

  if (utils.isFunction(paths)) {
    callback = paths;
    paths = field.paths;
  } else if (!paths) {
    paths = field.paths;
  }

  callback = callback || function() {};

  return function() {

    // Order
    if (req.body[paths.order]) {
      var images = item.get(field.path),
        newOrder = req.body[paths.order].split(',');

      images.sort(function(a, b) {
        return (newOrder.indexOf(a.public_id) > newOrder.indexOf(b.public_id)) ? 1 : -1;
      });
    }

    // Removals & Deletes
    if (req.body && req.body[paths.action]) {
      var actions = req.body[paths.action].split('|');

      actions.forEach(function(action) {
        action = action.split(':');
        var method = action[0],
          ids = action[1];

        if (!method.match(/^(remove|delete)$/) || !ids) return;

        ids.split(',').forEach(function(id) {
          field.removeImage(item, id, method);
        });
      });
    }

    // Upload References (direct uploading)
    if (req.body[paths.uploads]) {
      var uploads = JSON.parse(req.body[paths.uploads]);

      uploads.forEach(function(file) {
        item.get(field.path).push(file);
      });
    }

    // Upload Data (form submissions)
    if (req.files && req.files[paths.upload]) {
      var files = [].concat(req.files[paths.upload]);

      var tp = keystone.get('cloudinary prefix') || '';

      if (tp.length) {
        tp += '_';
      }

      var uploadOptions = {
        tags: [tp + field.list.path + '_' + field.path, tp + field.list.path + '_' + field.path + '_' + item.id]
      };

      if (keystone.get('cloudinary folders')) {
        uploadOptions.folder = item.get(paths.folder);
      }

      if (keystone.get('cloudinary prefix')) {
        uploadOptions.tags.push(keystone.get('cloudinary prefix'));
      }

      if (keystone.get('env') !== 'production') {
        uploadOptions.tags.push(tp + 'dev');
      }



      async.each(files, function(file, next) {

        if (!file.size) return next();

        var prefix = field.options.prefix || '';

        if (prefix.length) {
          prefix += '_';
        }

        var uploadOptions = {};
        var fileInfo = file;

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
          uploadOptions.public_id = fileInfo.name;
        }

        uploadOptions.public_id = prefix + uploadOptions.public_id;
        uploadOptions.originalname = fileInfo.originalname;
        uploadOptions.mimetype = fileInfo.mimetype;


        if (field.options.filenameAsPublicID) {
          uploadOptions.public_id = file.originalname.substring(0, file.originalname.lastIndexOf('.'));
        }

        var options = uploadOptions;

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
        qiniu.io.putFile(token, fileName, file.path, putExtra, function(err, result) {
          
          if (err) {
            return next(result);
          } else {

            
            sizeOf(fileInfo.path, function(err, dimensions) {
              if (err) {
                return next(err);
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

                item.get(field.path).push(result);
                return next();
              }
            });
          }
        });


      }, function(err) {
        return callback(err);
      });
    } else {
      return callback();
    }
  };
};


/**
 * Immediately handles a standard form submission for the field (see `getRequestHandler()`)
 *
 * @api public
 */

qiniuimages.prototype.handleRequest = function(item, req, paths, callback) {

  this.getRequestHandler(item, req, paths, callback)();
};


/*!
 * Export class
 */

exports = module.exports = qiniuimages;
