import { createSlice } from '@reduxjs/toolkit'

const electron = window.require('electron');
const ipcRenderer  = electron.ipcRenderer;

export const status = createSlice({
  name: 'status',
  initialState: {
    color: {},
    defaultColor: [],
    ledOn: true // 
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
      state.red = action.payload.red;
      state.green = action.payload.green; 
      state.blue = action.payload.blue;
    },
    setDefaultColor: (state, action) => {
      state.defaultRed = action.payload.red;
      state.defaultGreen = action.payload.green;
      state.defaultBlue = action.payload.blue;
    },
    muteLed(state) {
      state.mute = true;
    },
    unMuteLed(state) {
      state.mute = false;
    }
  },
})

// Action creators are generated for each case reducer function
export const { setColor, setDefaultColor, muteLed, unMuteLed, initializeStatus  } = status.actions;


export default status.reducer