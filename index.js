const https = require('https');
const rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'XIVAPI>'
});

var runner = new XIVAPI();

rl.prompt();

rl  .on('line', onInput)
    .on('close', ()=>{
        console.log('Goodbye!');
        process.exit(0);
    })

async function onInput(line) {
    let input = line.trim(),
        queryInput, outputInput,
        bForceLog = false;
    if(input.startsWith('*')) {
        input = input.slice(1);
        bForceLog = true;
    }
    if(i = input.indexOf('>')) {
        
    }
    if(input.includes('<')) {
        let t = input.split('<');
        queryInput = t[0].split(' ');
        outputInput = t[1].split(' ');
    }
    else {
        queryInput = input.split(' ');
    }

    command = queryInput[0];
    args = queryInput.slice(1);

    if(command in runner.endpoints){
        let constructor = runner.endpoints[command];
        
        if(args.length < constructor.length) {
            console.log(`${args.length} args provided while ${constructor.length} args expected`);
        }
        else {
            let d = await runner.doRequest(constructor(...args));

            if (bForceLog)
                console.log(d);
            else if(d instanceof Object) {
                if('Results' in d)
                    toStringTable(d.Results, outputInput);
                else
                    toStringTable([d], outputInput);
            }
            else if (d instanceof Array)
                toStringTable(d, outputInput);
            else
                console.log(d);
        }
    }

    rl.prompt();
}

/**
 * 
 * @param {object[]} data 
 * @param {string[]} columns Keys to pluck to make Columns, default is all columns are displayed
 * @param {string} seperator Column seperator
 */
function toStringTable(data, columns, seperator='\t') {
    let rows;
    if(columns) {
        rows = data.map((d)=>{
            return columns.map((key)=>d[key]);
        });
    }
    else {
        columns = Object.keys(data[0]);

        rows = data.map((d)=>{
            return Object.values(d);
        });
    }
    
    console.log(columns.join(seperator));
    rows.forEach((d)=>{
        console.log(d.join(seperator));
    });
}

/**
 * Helper class to make requests to XIVAPI
 */
function XIVAPI() {
    const __APIKEY = '25270ce756cd474e9864dbee';
    const __XIVAPI = 'https://xivapi.com';

    //https://stackoverflow.com/questions/111529/how-to-create-query-parameters-in-javascript
    function encodeQueryData(data) {
        const ret = [];
        for (let d in data) {
            if(data[d])
                ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
        }
        return ret.join('&');
     }

    this.endpoints = {
        'prices': (server, item_id)=>`/market/${server}/items/${item_id}`,
        'history': (server, item_id)=>`/market/${server}/items/${item_id}/history`,
        'listing': (server, category_id)=>`/market/${server}/category/${category_id}`,
        'categories': ()=>`/market/categories`,
        'search': (string, indexes='', string_column='', string_algo='', filters='')=>`/search?${encodeQueryData({string,indexes,string_column,string_algo,filters})}`,
        'item': (item_id)=>`/Item/${item_id}`
    }

    /**
     * @param {string} url Endpoint
     * @returns {Promise} Request Promise
     */
    this.doRequest = function(url) {
        // Market, Character, FC, LS, PvPTeam requests need an API Key
        var keyTest = /market|character|freecompany|linkshell|pvpteam/;

        return new Promise((resolve, reject)=>{
            var data = ''; //Assuming Data is Text/JSON

            let fullURL = `${__XIVAPI}${url}`;
            if(keyTest.test(url))
                fullURL += `?key=${__APIKEY}`;

            https.get(fullURL, (res)=>{
                const {statusCode} = res;
                if(statusCode !== 200) {
                    reject(statusCode);
                    res.resume();
                    return;
                }

                res.setEncoding('utf8');
                res.on('data', (d)=>{
                    data+=d;
                });

                res.on('end', ()=>{
                    resolve(JSON.parse(data));
                })
            })
        });
    }

    return this;
}