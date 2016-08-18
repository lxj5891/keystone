var _ = require('underscore'),
  React = require('react'),
  Field = require('../Field');

var SUPPORTED_TYPES = ['image/gif', 'image/png', 'image/jpeg', 'image/bmp', 'image/x-icon', 'application/pdf', 'image/x-tiff', 'image/x-tiff', 'application/postscript', 'image/vnd.adobe.photoshop', 'image/svg+xml'];

console.log("create thumbnails class  0");

var Thumbnail = React.createClass({
  
  displayName: 'QiniuImagesField',

  render: function() {

    console.log("create thumbnails class  1");

    console.log("create thumbnails class render 2");

    var iconClassName, imageDetails;

    if (this.props.deleted) {
      iconClassName = 'delete-pending ion-close';
    } else if (this.props.isQueued) {
      iconClassName = 'img-uploading ion-upload';
    }

    var previewClassName = 'image-preview';
    if (this.props.deleted || this.props.isQueued) previewClassName += ' action';

    var title = '';
    var width = this.props.width;
    var height = this.props.height;
    if (width && height) title = width + ' x ' + height;

    var actionLabel = this.props.deleted ? 'Undo' : 'Remove';

    if (!this.props.isQueued) {
      imageDetails = (
        <div className='image-details'>
          <button onClick={this.props.toggleDelete} type='button' className='btn btn-link btn-cancel btn-undo-remove'>{actionLabel}</button>
        </div>
      );
    }

    return (
      <div className='image-field image-sortable row col-sm-3 col-md-12' title={title}> 
        <div className={previewClassName}> 
          <a href={this.props.url} className='img-thumbnail'>
            <img style={{ height: '90' }} className='img-load' src={this.props.url} />
            <span className={iconClassName} />
          </a>
        </div>

        {imageDetails}
      </div>
    );
  }
  
});

module.exports = Field.create({

  getInitialState: function() {

    console.log("Field getInitialState 0");

    var thumbnails = [];
    var self = this;

    _.each(this.props.value, function (item) {
      self.pushThumbnail(item, thumbnails);
    });

    return { thumbnails: thumbnails };
  },

  removeThumbnail: function (i) {
    
    console.log("Field removeThumbnail 1");

    var thumbs = this.state.thumbnails;
    var thumb = thumbs[i];

    if (thumb.props.isQueued) {
      thumbs[i] = null;
    } else {
      thumb.props.deleted = !thumb.props.deleted;
    }

    this.setState({ thumbnails: thumbs });
  },

  pushThumbnail: function (args, thumbs) {
    
    console.log("Field pushThumbnail 2");

    thumbs = thumbs || this.state.thumbnails;
    var i = thumbs.length;
    args.toggleDelete = this.removeThumbnail.bind(this, i);
    thumbs.push(<Thumbnail key={i} {...args} />);
  },

  fileFieldNode: function() {
    
    console.log("Field fileFieldNode 2");

    return this.refs.fileField.getDOMNode();
  },

  getCount: function (key) {

    console.log("Field getCount 3");

    var count = 0;

    _.each(this.state.thumbnails, function (thumb) {
      if (thumb && thumb.props[key]) count++;
    });

    return count;
  },

  renderFileField: function() {
    
    console.log("Field renderFileField 4");

    return <input ref='fileField' type='file' name={this.props.paths.upload} multiple className='field-upload' onChange={this.uploadFile} />;
  },

  clearFiles: function() {

    console.log("Field clearFiles 4");

    this.fileFieldNode().value = '';

    this.setState({
      thumbnails: this.state.thumbnails.filter(function (thumb) {
        return !thumb.props.isQueued;
      })
    });
  },

  uploadFile: function (event) {

    console.log("Field uploadFile 5");


    var self = this;

    var files = event.target.files;
    _.each(files, function (f) {
      if (!_.contains(SUPPORTED_TYPES, f.type)) {
        alert('Unsupported file type. Supported formats are: GIF, PNG, JPG, BMP, ICO, PDF, TIFF, EPS, PSD, SVG');
        return;
      }

      if (window.FileReader) {
        var fileReader = new FileReader();
        fileReader.onload = function (e) {
          self.pushThumbnail({ isQueued: true, url: e.target.result });
          self.forceUpdate();
        };
        fileReader.readAsDataURL(f);
      } else {
        self.pushThumbnail({ isQueued: true, url: '#' });
        self.forceUpdate();
      }
    });
  },

  changeImage: function() {

    console.log("Field changeImage 6");

    this.fileFieldNode().click();
  },

  hasFiles: function() {

    console.log("Field hasFiles 7");

    return this.refs.fileField && this.fileFieldNode().value;
  },

  renderToolbar: function() {

    console.log("Field renderToolbar 8");

    var body = [];

    var push = function (queueType, alertType, count, action) {
      if (count <= 0) return;

      var imageText = count === 1 ? 'image' : 'images';

      body.push(<div key={queueType + '-toolbar'} className={queueType + '-queued' + ' pull-left'}>
        <div className={'alert alert-' + alertType}>{count} {imageText} {action} - save to confirm</div>
      </div>);
    };

    push('upload', 'success', this.getCount('isQueued'), 'queued for upload');
    push('delete', 'danger', this.getCount('deleted'), 'removed');

    var clearFilesButton;
    if (this.hasFiles()) {
      clearFilesButton = <button type='button' className='btn btn-default btn-upload' onClick={this.clearFiles}>Clear selection</button>;
    }

    return (
      <div className='images-toolbar row col-sm-3 col-md-12'>
        <div className='pull-left'>
          <button type='button' className='btn btn-default btn-upload' onClick={this.changeImage}>Select files</button>
          {clearFilesButton}
        </div>
        {body}
      </div>
    );
  },

  renderPlaceholder: function() {

    console.log("Field renderToolbar 9");

    return (
      <div className='image-field image-upload row col-sm-3 col-md-12' onClick={this.changeImage}>
        <div className='image-preview'>
          <span className='img-thumbnail'>
            <span className='img-dropzone' />
            <div className='ion-picture img-uploading' />
          </span>
        </div>

        <div className='image-details'>
          <span className='image-message'>Click to upload</span>
        </div>
      </div>
    );
  },

  renderContainer: function() {

    console.log("Field renderContainer 10");

    return (
      <div className='images-container clearfix'>
        {this.state.thumbnails}
      </div>
    );
  },

  renderFieldAction: function() {

    console.log("Field renderFieldAction 11");

    var value = '';
    var remove = [];
    _.each(this.state.thumbnails, function (thumb) {
      if (thumb && thumb.props.deleted) remove.push(thumb.props.public_id);
    });
    if (remove.length) value = 'remove:' + remove.join(',');

    return <input ref='action' className='field-action' type='hidden' value={value} name={this.props.paths.action} />;
  },

  renderUploadsField: function() {

    console.log("Field renderFieldAction 12");

    return <input ref='uploads' className='field-uploads' type='hidden' name={this.props.paths.uploads} />;
  },

  renderUI: function() {

    console.log("Field renderUI 13");

    return (
      <div className='field field-type-qiniuimages'>
        <label className='field-label'>{this.props.label}</label>

        {this.renderFieldAction()}
        {this.renderUploadsField()}
        {this.renderFileField()}

        <div className='field-ui'>
          {this.renderContainer()}
          {this.renderToolbar()}
        </div>
      </div>
    );
  }
});
