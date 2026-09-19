import axios from 'axios'

const api = axios.create({
  baseURL: 'http://10.143.119.136:3000/api',
})

export default api