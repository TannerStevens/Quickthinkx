const https = require('https');
const rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'XIVAPI>'
});

const __APIKEY = '25270ce756cd474e9864dbee';
const __XIVAPI = 'https://xivapi.com';
var runner = new XIVAPI(__APIKEY, __XIVAPI, 10);

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
    if(input.includes('<')) {
        let t = input.split('<');
        queryInput = parseQuery(t[0]);
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
 * @todo
 *     null
 *     |0
 * 0   search
 *     |0          \1          \2          \3
 * 1   ifrit        inferno     skeavan     allagan
 *     |0  \1       |0  \1      |0  \1      |0  \1
 * 2   item recipe  item recipe item recipe item recipe
 * @example "search (ifrit, inferno, skeavan, allagan) (item, recipe)" ->
 * [0:'search', 1:['ifrit', 'inferno', 'skeavan', 'allagan'], 2:['item', 'recipe']]
 * ->
 * [
 *  ['search', 'ifrit', 'item'],
 *  ['search', 'ifrit', 'recipe'],
 *  ['search', 'inferno', 'item'],
 *  ['search', 'inferno', 'recipe'],
 *  ...
 * ]
 * @param {string} rawQuery 
 * @returns {string[][]} Array of arrays of all command permutations
 */
function parseQuery(rawQuery) {
    let groupedCheck = /\(.*\)/;

    let t = rawQuery.split(' ');
    t = t.map((d)=>{
        if(groupedCheck.test(d))
            return d.substr(1, d.length-2).split(', ');
        return d;
    });

    function _ (corpus, level) {
        return new Promise((resolve, reject)=>{
            if(corpus === t.length)
                resolve(corpus);
            else {
                if(t[level] instanceof Array) {
                    let all = Promise.all(t[level].map((d)=>_(corpus.concat(d), level+1)));
                    resolve(all);
                }
                else { //Assume single value
                    resolve(_(corpus.concat(t[level]), level+1));
                }
            }
        });
    }
}

/**
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
 * @description Helper class to make requests to XIVAPI
 */
function XIVAPI(API_KEY, API_URL, API_REQUEST_LIMIT=10) {
    var flux = [new Date(), 0];
    var activeRequests = [];
    var queuedRequests = [];

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
     * @todo Implement request limiter
     * @todo Cache results (XIVAPI)
     * @param {string} url Endpoint
     * @returns {Promise} Request Promise
     */
    this.doRequest = async function(url) {
        // Market, Character, FC, LS, PvPTeam requests need an API Key
        var keyTest = /market|character|freecompany|linkshell|pvpteam/;

        let fullURL = `${API_URL}${url}`;
        if(keyTest.test(url))
            fullURL += `?key=${API_KEY}`;

        let request = new Request(fullURL);
        let returnPromise = request.promise.then(()=>{
            activeRequests.splice(activeRequests.findIndex(request));
            processQueue();
        });

        queuedRequests.push(request);
        processQueue();

        return returnPromise;
    }

    function processQueue() {
        function toSeconds(time) {
            return Math.floor(time/1000);
        }

        let now = toSeconds(Date.now());
        if(flux[0] !== now) { //Time has advanced
            flux[0] = now;
            flux[1] = 0;
        }
        else if(flux[1] >= API_REQUEST_LIMIT) return;
        let r = queuedRequests.pop();
        activeRequests.push(r);
        r.do();
        flux[1]++;
    }

    return this;
}

/**
 * @description Request Class facilitates fulfilling a promise without immediately launching the http.get call
 * @param {string} url 
 */
function Request(url) {
    var _resolve, _reject;
    this.promise = new Promise((resolve, reject)=>{
        _resolve = resolve;
        _reject = reject;
    });

    this.timestamp = new Date();

    this.do = function() {
        var data = ''; //Assuming Data is Text/JSON

        https.get(url, (res)=>{
            const {statusCode} = res;
            if(statusCode !== 200) {
                _reject(statusCode);
                res.resume();
                return;
            }

            res.setEncoding('utf8');
            res.on('data', (d)=>{
                data+=d;
            });

            res.on('end', ()=>{
                _resolve(JSON.parse(data));
            })
        });
    }

    return this;
}