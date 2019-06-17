var express = require('express')
var fs = require('fs');
const request = require('request'); //npm
cfenv = require("cfenv")
 
var htmlHeader, formhtml

//for CloudFoundry: instantiate appropriate port and url
appEnv   = cfenv.getAppEnv()
instance = appEnv.app.instance_index || 0

var indexhtmlPromise = new Promise((resolve,reject) => {
    fs.readFile('www/index-app.html', 'utf8', function(err, data){
        htmlHeader = data
        resolve();
    });
})
var formhtmlPromise = new Promise((resolve,reject) => {
    fs.readFile('www/form/index.html', 'utf8', function(err, data){
        formhtml = data
        resolve();
    });
})

//Gets Parameters from Url query string
function GetParamsPromise(req,res){
    return new Promise((resolve,reject) => {
        var _url_str = req.url
        // add localhost to get a url shape, recognised by searchParams - we only care about query parameters
        var _url = new URL("http://localhost.com" + _url_str) 
        var Params = _url.searchParams

        // use nonconsolelog to stop logging in console
        if (Params.get('consolelog')=='no') {console.log("console log disabled");console.log = function() {}} 
        var username = Params.get('user');
        var password = Params.get('pwd');
        var auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
        var sys = Params.get('system')

        // create some Dates
        var date_today = new Date()
        var date_tomorrow = new Date()
        date_tomorrow.setDate(date_today.getDate() + 1)
        var date_nextMonth = new Date()
        date_nextMonth.setMonth(date_today.getMonth() + 1)

        //baton Object to carry variables down the promise chain
        var baton = new Object()
        baton.auth = auth; baton.res = res; baton.sys = sys;

        console.log('---------------------------GetParms-------------------------------------')
        console.log('system:');console.log(sys)
        console.log('user:');console.log(username)
        console.log('password:');console.log(password)
        console.log('----------------------------End-GetParams-----------------------------------')

        // Error handling
        if (sys == null || username == null || password == null ) {res.write('Error in passed Url-parameters. Specify again in below form</th></tr></thead></table>');reject(1); }
        else {res.write("System " + sys + '</th></tr></thead>'); 
        resolve(baton)}
    })
}

function GetRequestPromise(baton, API_hardcode){
    return new Promise((resolve,reject) => {
        
        //Select the API to post to with query paramters possibly from the last iteration
        if (baton.process === 'PlannedOrder') {baton.url_request = "https://my" + baton.sys + ".s4hana.ondemand.com/sap/opu/odata/sap/" + API_hardcode}
        if (baton.process === 'ProductionOrder') {baton.url_request = "https://my" + baton.sys + ".s4hana.ondemand.com/sap/opu/odata/sap/" + API_hardcode + "(PlannedOrder='" + baton.PlannedOrder + "')" }
        if (baton.process === 'ProductionOrderRelease') {baton.url_request = "https://my" + baton.sys + ".s4hana.ondemand.com/sap/opu/odata/sap/" + API_hardcode + "('" + baton.ProductionOrder + "')" }
        
        const options = {  
            url: baton.url_request,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Accept-Charset': 'utf-8',
                'User-Agent': 'my-reddit-client',
                'Authorization': baton.auth,
                'x-csrf-token':'Fetch',
                'etag': 'Fetch'
            }
        };

        console.log('------------------------------GetRequest---------------------------------------')
        console.log('------------------------------Request-Header-----------------------------------')
        console.log(JSON.stringify(options, null, 4))

        request(options, function(err, res, body) {
            
            baton.csrf = res.headers["x-csrf-token"]
            baton.cookie = res.headers['set-cookie']
            //etag = res.headers['etag'] if needed someday currently getting etag from Post
             
            console.log('----------------------------Response-Header----------------------------------')  
            console.log(JSON.stringify(res.headers, null, 4))
            console.log('----------------------------Response-Body------------------------------------')
            console.log(JSON.parse(body))
            console.log('----------------------------End-GetRequest-----------------------------------')

            resolve(baton)
        });
    })
}

function PostRequestPromise(baton,body_post,API_hardcode){
    return new Promise((resolve,reject) => {

        //Select the API to post to with query paramters possibly from the last iteration
        if (baton.process === 'ProductionOrder') {baton.url_request = "https://my" + baton.sys + ".s4hana.ondemand.com/sap/opu/odata/sap/" + API_hardcode + "?PlannedOrder='" + baton.PlannedOrder + "'" }
        if (baton.process === 'ProductionOrderRelease') {baton.url_request = "https://my" + baton.sys + ".s4hana.ondemand.com/sap/opu/odata/sap/" + API_hardcode + "?ManufacturingOrder='" + baton.ProductionOrder + "'" }
        if (baton.process === 'ProductionOrderConfirmation') {
            baton.url_request = "https://my" + baton.sys + ".s4hana.ondemand.com/sap/opu/odata/sap/" + API_hardcode;
            body_post.OrderID = baton.ProductionOrder;
        }
        if (baton.process === 'MaterialDocument') {baton.url_request = "https://my" + baton.sys + ".s4hana.ondemand.com/sap/opu/odata/sap/" + API_hardcode 
            body_post["to_MaterialDocumentItem"][0].ManufacturingOrder = baton.ProductionOrder;
        }

        var body_post_string = JSON.stringify(body_post)
        var options2 = {
            url: baton.url_request,
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Content-Length': body_post_string.length,
                'Accept-Charset': 'utf-8',
                'User-Agent': 'my-reddit-client',
                'Authorization': baton.auth,
                'x-csrf-token': baton.csrf,
                'cookie': baton.cookie,
                },
            body: body_post_string
        };
        if (baton.etag != null) {options2.headers['if-Match'] = baton.etag}

        console.log('----------------------------PostRequest--------------------------------------')
        console.log('----------------------------Request-Header-----------------------------------')
        console.log(JSON.stringify(options2, null, 4))

        request(options2, function(err, res, body) {
            
            //get etag
            if (baton.process == "ProductionOrder" || baton.process == "PlannedOrder") {baton.etag = JSON.parse(body).d.__metadata.etag}
           
            //get Production/Planned Order ID
            if (baton.process === 'PlannedOrder') {
                baton.PlannedOrder = JSON.parse(body).d.PlannedOrder;console.log('PlanedOrder created:');console.log(baton.PlannedOrder);
                baton.res.write('<tbody><tr class="row100 body"><td class="cell100 column1">Planned Order ' + baton.PlannedOrder + ' created</td></tr>')
            }
            if (baton.process === 'ProductionOrder') {
                baton.ProductionOrder = JSON.parse(body).d.ProductionOrder;console.log('ProductionOrder created:');console.log(baton.ProductionOrder);
                baton.res.write('<tr class="row100 body"><td class="cell100 column1">Production Order ' + baton.ProductionOrder + ' created</td></tr>')
            }
            if (baton.process === 'ProductionOrderRelease'){
                baton.res.write('<tr class="row100 body"><td class="cell100 column1">Production Order released</td></tr>')
            }
            if (baton.process === 'ProductionOrderConfirmation'){
                baton.res.write('<tr class="row100 body"><td class="cell100 column1">Production Order has been confirmed</td></tr>')
            }
            if (baton.process === 'MaterialDocument'){
                baton.res.write('<tr class="row100 body"><td class="cell100 column1">Material Document Header was posted</td></tr>')
            }
            //if (baton.process === 'MaterialDocument') {baton.ProductionOrder = JSON.parse(body).d.ProductionOrder;console.log('ProductionOrder created:');console.log(baton.ProductionOrder)}

            console.log('----------------------------Response-Body-------------------------------------')
            console.log(JSON.parse(body))
            console.log('----------------------------End-PostRequest-----------------------------------')
            resolve(baton)
        });
    });       
}

//body's that get posted
var body_post_planedorder = {
    "Material": "MZ-FG-M600",
    "MRPArea": "1710",
    "MaterialProcurementCategory": "E", 
    "TotalQuantity": "1",
    "PlndOrderPlannedStartDate": "/Date(1560333596877)/",
    "PlndOrderPlannedEndDate": "/Date(1562839196877)/",
    "PlannedOrderOpeningDate": "/Date(1560247196877)/"
}
var body_empty = {}
var body_confirmation = { 
    "ConfirmationUnit"  : "EA", 
    "ConfirmationUnitISOCode" : "EA", 
    "ConfirmationYieldQuantity" : "1"
} 
var body_material = {
    "PostingDate": "2019-06-13T11:25:00", 
    "GoodsMovementCode": "02", 
    "to_MaterialDocumentItem": [
        {
        "Material": "MZ-FG-M600", 
        "Plant": "1710", 
        "StorageLocation": "171A", 
        "GoodsMovementType": "101",
        "ManufacturingOrder": "[use baton]", 
        "ManufacturingOrderItem": "1", 
        "GoodsMovementRefDocType": "F", 
        "EntryUnit": "EA", 
        "QuantityInEntryUnit": "1"
        }
    ]
} 

function onRequest (req, res){
  if (req.url != '/favicon.ico'){
    res.writeHead(200, {
      'Content-Type':'text/html',
      'connection': 'keep-alive'
    });
    Promise.all([indexhtmlPromise, formhtmlPromise])
        .then(function(){res.write(htmlHeader);return GetParamsPromise(req,res)})
        .then(function(baton){baton.process = 'PlannedOrder'; return GetRequestPromise(baton,"API_PLANNED_ORDERS/A_PlannedOrder")})
        .then(function(baton){return PostRequestPromise(baton,body_post_planedorder)})
        .then((baton) => {baton.process = 'ProductionOrder'; return PostRequestPromise(baton,body_empty,"API_PRODUCTION_ORDERS/ConvertPlannedOrder")})
        .then((baton) => {baton.process = 'ProductionOrderRelease'; return PostRequestPromise(baton,body_empty,"API_PRODUCTION_ORDERS/ReleaseProductionOrder")})
        .then((baton) => {baton.process = 'ProductionOrderConfirmation'; return PostRequestPromise(baton,body_confirmation,"API_PROD_ORDER_CONFIRMATION_2_SRV/ProdnOrdConf2")})
        .then((baton) => {baton.process = 'MaterialDocument'; return PostRequestPromise(baton,body_material,"API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentHeader")})
        .then(function(){return res.end("</tbody></table></div></div></div></div></body></html>")})
        .catch(function(lastPromise){console.log("SOME ERROR OCCURRED");return res.end(formhtml)})
  }
}

//instantiate server
var app = express();
app.use(express.static('www'));
app.get('/', onRequest);


app.listen(appEnv.port, function() {
    console.log("server starting on " + appEnv.url)
})
