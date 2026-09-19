import axios from 'axios'

const api = axios.create({
  baseURL: 'https://contactless-checkout-backend.onrender.com/api',
})

export default api