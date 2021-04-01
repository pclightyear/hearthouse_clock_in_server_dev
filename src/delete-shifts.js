import './index.css';
import './shifts.css';
import './delete-shifts.css';
const config = require('./config.json');
var AWS = require('aws-sdk');

if (config.DEVELOPMENT) {
    var PRODUCTION = false;
    var awsRegion = config.DEV.awsRegion;
    var IdentityPoolId = config.DEV.IdentityPoolId;
} else {
    var PRODUCTION = true;
    var awsRegion = config.PROD.awsRegion;
    var IdentityPoolId = config.PROD.IdentityPoolId;
}

var DELETE_CONFIRM_TEXT = "deleteAllShift";

AWS.config.update({
    region: awsRegion,
    credentials: new AWS.CognitoIdentityCredentials({
    IdentityPoolId: IdentityPoolId
    })
});

var lambda = new AWS.Lambda({
    apiVersion: '2015-03-31'
});

const dynamodb = new AWS.DynamoDB({
    apiVersion: "2012-08-10",
});

export function displayDeleteConfirmForm() {
    var deleteConfirmForm = document.getElementById("delete-confirm-form");
    deleteConfirmForm.style.display = "block"
}

function hideDeleteConfirmForm() {
    var deleteConfirmForm = document.getElementById("delete-confirm-form");
    deleteConfirmForm.style.display = "none"
}

export function deleteAllShifts() {
    var confirmText = document.getElementById("delete-confirm-input").value;
    if (confirmText === DELETE_CONFIRM_TEXT) {
        // TODO: need to await delete result to display suceess or error msg
        var scanParams = {
            TableName: tableName
        };
        
        dynamodb.scan(scanParams, (err, res) => {
            if (err) {
                console.log(err, err.stack); // an error occurred
                displayDeleteShiftsErrMsg();
            } else {
                var itemList = res.Items;
                if (!itemList) {
                    displayDeleteShiftsErrMsg();
                }
    
                console.log(itemList)
        
                // batch delete
                var requests = []
    
                itemList.forEach(item => {
                    var name = item.name.S;
    
                    requests.push({
                        "DeleteRequest": {
                            "Key": {
                                "name": {"S": name},
                            }
                        }
                    })
                })
    
                var deleteParams = {
                    "RequestItems": {
                        [tableName]: requests
                    }
                }
    
                dynamodb.batchWriteItem(deleteParams, (err, res) => {
                    if (err) {
                        console.log(err, err.stack); // an error occurred
                        displayDeleteShiftsErrMsg();
                    } else {
                        displayDeleteShiftsErrMsg()
                    }
                })
            }
        });
    } else {
        displayConfirmTextErrMsg()
    }

    hideDeleteConfirmForm()
}

function displayDeleteShiftsSuccessMsg() {
    alert("刪除全部班表成功！")
}

function displayDeleteShiftsErrMsg() {
    alert("刪除全部班表失敗，請重新嘗試")
}

function displayConfirmTextErrMsg() {
    alert("輸入字串錯誤，請重新輸入")
}