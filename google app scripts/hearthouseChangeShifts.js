function onFormSubmit(event) {
    Logger.log(event);
    Logger.log(event.namedValues);
    Logger.log(event.values);
  
    var DEVELOPMENT = false;
    var DEV_URL = `your development url`;
    var PROD_URL = `your production url`;
  
    if (DEVELOPMENT) {
      var url = DEV_URL;
    } else {
      var url = PROD_URL;
    }
    var data = {
      "data": event.values
    }
    var options = {
        "method": "post",
        'contentType': 'application/json',
        "payload": JSON.stringify(data)
    };
  
    var response = UrlFetchApp.fetch(url, options);
    Logger.log(response.getContentText());
  }
  