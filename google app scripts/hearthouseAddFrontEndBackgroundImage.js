// In order to use this script, 
// you should add following permissions in appsscript.json.
// 
// "oauthScopes": [
//   "https://www.googleapis.com/auth/drive.readonly",
//   "https://www.googleapis.com/auth/drive",
//   "https://www.googleapis.com/auth/script.external_request"
// ]
//
// You can follow the website below to modify appsscript.json
// https://developers.google.com/apps-script/concepts/scopes#setting_explicit_scopes
//
// After modifying, you need to manually grant the permission to the script.
// You can click "debug" or "execute" to call out the grant permission pop out window.


function onFormSubmit(event) {
  Logger.log(event);
  Logger.log(event.namedValues);
  Logger.log(event.values);

  var DEVELOPMENT = false;
  // var DEV_URL = `your development url`;
  var PROD_URL = `your production url`;

  // event.namedValues['上傳圖片'] is an array containing only one element,
  // which is a string with all image's google drive urls concatenated with ', '
  var image_google_urls = event.namedValues['上傳圖片'][0].split(', ');
  var image_download_urls = [];

  // get image file in google drive
  for (var i = 0; i < image_google_urls.length; i++) {
    Logger.log("i: " + i.toString());
    var image_url = image_google_urls[i];
    Logger.log("image url: " + image_url);
    var image_id = image_url.split('?id=')[1];
    Logger.log("image id: " + image_id);
    var image = DriveApp.getFileById(image_id);

    // set access permission to public so that the AWS lambda function can download the file
    image.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
    
    // send the image download url to AWS lambda function
    image_download_urls.push(image.getDownloadUrl());
  }

  Logger.log(image_download_urls);

  if (DEVELOPMENT) {
    var url = DEV_URL;
  } else {
    var url = PROD_URL;
  }
  var data = {
    "data": image_download_urls
  }
  var options = {
      "method": "post",
      'contentType': 'application/json',
      "payload": JSON.stringify(data)
  };

  var response = UrlFetchApp.fetch(url, options);
  Logger.log(response.getContentText());
}

  