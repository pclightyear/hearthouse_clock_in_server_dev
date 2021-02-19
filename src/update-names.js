import './index.css';
import './shifts.css';
import './update-names.css';

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

AWS.config.update({
    region: awsRegion,
    credentials: new AWS.CognitoIdentityCredentials({
        IdentityPoolId: IdentityPoolId
    })
});

var lambda = new AWS.Lambda({
    apiVersion: '2015-03-31',
    region: awsRegion,
    credentials: new AWS.CognitoIdentityCredentials({
        IdentityPoolId: IdentityPoolId
    })
});

var update_name_list = [];
var FILE_INPUT = "fileInput";
var NAME_CHECK_DIV = "nameCheckDiv";
var UPLOAD_BTN = "uploadButton";

export function parseNameFile() {
    var fileInput = document.getElementById(FILE_INPUT);

    var blob = new Blob(fileInput.files);
    blob.text().then(text => {
        var remove_white_re = / |\t/g;
        text = text.replace(remove_white_re, '');

        var split_re = /\r\n|\r|\n/;
        update_name_list = text.split(split_re);
        update_name_list = update_name_list.filter(Boolean);
        // console.log(update_name_list);
        displayCheckNameList();
    })
}

function displayCheckNameList() {
    var nameCheckDiv = document.getElementById(NAME_CHECK_DIV);

    if (nameCheckDiv.childNodes[0]) {
        nameCheckDiv.removeChild(nameCheckDiv.childNodes[0]);
    }

    var name_list_p = document.createElement('p');
    name_list_p.innerHTML = update_name_list.toString();

    nameCheckDiv.appendChild(name_list_p);
    nameCheckDiv.style.display = 'block';

    document.getElementById(UPLOAD_BTN).style.display = "flex";
}

export function updateNameList() {
    console.log("updateNameList");
    console.log(update_name_list);

    var params = {
        FunctionName: "hearthouseUpdateNameList", 
        Payload: JSON.stringify({
            "nameList": update_name_list,
        }), 
    };
    
    lambda.invoke(params, function(err, data) {
        if (err) {
            console.log(err, err.stack) // an error occurred
            displayUpdateNameListFailMsg(err);
        }  
        else {
            console.log(JSON.parse(data.Payload))
            var res = JSON.parse(data.Payload)
            console.log(res.msg)
            if (res.success == null | res.success == false) {
                displayUpdateNameListFailMsg(res.msg)
            } else {
                displayUpdateNameListSuccessMsg()
                resetUI()
            }
        }
    });
}

export function resetUI() {
    console.log("resetUI")
    document.getElementById(NAME_CHECK_DIV).style.display = "none";
    document.getElementById(UPLOAD_BTN).style.display = "none";
    document.getElementById(FILE_INPUT).value = "";
}

function displayUpdateNameListFailMsg(err) {
    alert(`
        更新志工名單失敗，請再試一次或聯絡系統管理員。

        錯誤訊息：
        ${err}
    `)
}

function displayUpdateNameListSuccessMsg() {
    alert("更新志工名單成功！")
}