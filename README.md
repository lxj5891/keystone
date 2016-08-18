
## 使用方法

* keystone.js

```
.
..
...

keystone.init({

	'name': 'Qiniu-Keystone',
	'brand': 'Qiniu-Keystone',

	'less': 'public',
	'static': 'public',
	'favicon': 'public/favicon.ico',
	'views': 'templates/views',
	'view engine': 'jade',

	'auto update': true,
	'session': true,
	'auth': true,
	'user model': 'User',
	'qiniu config': {
		access_key: 'access_key',
		secret_key: 'secret_key',
		host: 'http://localhost',
		secure_host: 'https://localhost'
	}
});

...
..
.

```
* models
```
/**
 * QiniuImages Model
 * ==========
 */

var keystone = require('keystone');
var Types = keystone.Field.Types;


var QiniuImages = new keystone.List('QiniuImages');

QiniuImages.add({
	name: {type: String, required: true, index: true},
	heroImage: {
		type: Types.QiniuImage,
		autoCleanup: true,
		bucket: 'customer',
		format: function (item, file) {
			return '<img src="'+item.heroImage.secure_url+'" style="max-width: 300px"/>';
		}
	},
	heroImages: {
		type: Types.QiniuImages,
		autoCleanup: true,
		bucket: 'customer',
		prefix: "test/prefix/",
		format: function (item, file) {
			var html = ""
			for (var i = 0; i < item.length; i++) {
				html = html + '<img src="'+item[i]+'" style="max-width: 80px"/>';
			}
			return html;
		}
	}
});

/**
 * Registration
 */
QiniuImages.defaultColumns = 'name, heroImage';
QiniuImages.register();

```


## License

(The MIT License)

Copyright (c) 2015 Jed Watson

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
