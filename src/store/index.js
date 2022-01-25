import { configureStore } from '@reduxjs/toolkit'
import status from './status'

export default configureStore({
 reducer: {
  status
 },
})
