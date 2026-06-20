import axios from 'axios'
const serves = axios.create({
  baseURL: __CONFIG__.BASE_API,
  timeout: 5000,
})

// Set request interceptor before sending
serves.interceptors.request.use(
  (config) => {
    // Process data before sending
    return config
  },
  (err) => Promise.reject(err),
)

// Set response interceptor
serves.interceptors.response.use(
  (res) => {
    // Process data after receiving
    if (res.data.code === 50000) {
      // ElMessage.error(res.data.data);
    }
    return res
  },
  (err) => {
    // Check if error contains timeout string
    if (err.message.includes('timeout')) {
      console.log('Error callback', err)
    }
    if (err.message.includes('Network Error')) {
      console.log('Error callback', err)
    }
    return Promise.reject(err)
  },
)

// Export serves
export default serves
