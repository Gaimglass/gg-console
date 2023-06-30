const express = require('express')
const cors = require('cors');
//var bodyParser = require('body-parser')

const { connectUsb, setColor, waitForSerial, setLEDOn, getMainLED, getDefaultLEDs, setMainLED, setDefaultColors, setDefaultIndex, disconnectUsb, serialDisconnected } = require('../electron/usb');


const port = 55400



function startExpress(mainWindow) {
  const app = express()
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  //app.use(bodyParser.json())

  console.log({mainWindow})


  app.use(cors({
    origin: '*'
  }));


  app.post('/info', (req, res) => {
    const info = req.body;
    //console.log("INFO", info);
    res.send('okay');
  });

  app.post('/event', (req, res) => {
    const body = req.body;
    const screenName = body.screename
    const events = body.events;
    events.forEach(event => {
      const data = JSON.parse(event.data);
      if (event.name ==='kill_feed') {
        if (data.attacker === screenName) {
          // user made a kill
          //console.log("FRAG")
        } else if (data.victim === screenName) {
          // user died
          //console.log("DEATH")
        }
      } else if (event.name ==='kill') {
        console.log("FRAG 2", event)
        // FRAG 2 { name: 'kill', data: '{\r\n  "totalKills": 5\r\n}' }  
        console.log("data", JSON.parse(event.data))
      } else if (event.name ==='death') {
        console.log("DEATH 2", event)
        // DEATH 2 { name: 'death', data: '{\r\n  "totalDeaths": 26\r\n}' }
        console.log("data", JSON.parse(event.data))
      } else if (event.name ==='fired') {
        console.log("FIRED")
      }
      else if (event.name ==='weapon_change') {
        console.log("weapon_change")
      }

      
    })
    //console.log("EVENT", events)
    res.send('okay');
    
    
    /* events.forEach(event=>{
      
      if(event.name == 'roster') {
        console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
        console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
      } 
      console.log(event.name);
      console.log(event.data);

    }) */
    
    //console.log("3", req.body.e.name)
    //console.log("2", req.body.e.data)
    //console.log("1", JSON.parse(req.body.e.data))


    //console.log(req.params)
    //console.log(req.url)
    //res.json({'test': 'foo'});
  })

  app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    //mainWindow.webContents.send('update-send-test-ow-event', {foo: "bar"});
    res.type('json')
    res.json({a:1});
    //res.json({'test': 'foo'});
  })


  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
  })
}

module.exports = {
  startExpress
}



// disabled on ADS
// themes:
//   kill streak colors (all)
//     blue->teal->mint->green->yellow->orange->red->purple
//   per weapon colors (apex, cs:go)
//   color cycle  
//      period
//      per game
// 




/*
[
  {
    color: [1,2,3,0.5],
    time: 0.4,
  }
]*/