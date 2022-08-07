import { createSlice } from '@reduxjs/toolkit'

const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;

export const status = createSlice({
  name: 'status',
  initialState: {
    brightness: 0,
    color: {
      red: 0,
      green: 0,
      blue: 0,
    },
    auxColor: {
      red: 0,
      green: 0,
      blue: 0,
    },
    defaultColors: [],
    ledOn: true, // 
    gaimglassConnected: false,
    //gameLink: true // 
  },
  reducers: {
    /*initializeStatus: (state, action) => {
      const c = ipcRenderer.sendSync('get-status');    
      debugger;
      // if (c) {
      //   status.caseReducers.setColor(state, c);
      //   ipcRenderer.sendSync('set-color', c);
      // } else {
      //   // set up default color perhaps?
      // }
    },*/
    setColor: (state, action) => { 
      state.color.red = action.payload.color.red;
      state.color.green = action.payload.color.green; 
      state.color.blue = action.payload.color.blue;
    },
    setDefaultColor: (state, action) => {
      // state.defaultRed = action.payload.red;
      // state.defaultGreen = action.payload.green;
      // state.defaultBlue = action.payload.blue;
    },
    muteLed(state) {
      state.mute = true;
    },
    unMuteLed(state) {
      state.mute = false;
    },
    setBrightness(state, action) {
      state.brightness = action.brightness;
    }
  },
})

// Action creators are generated for each case reducer function
export const { setColor, setDefaultColor, muteLed, unMuteLed, initializeStatus  } = status.actions;


export default status.reducer