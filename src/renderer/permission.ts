import router from './router'
import Performance from '@renderer/utils/performance'

var end = null
router.beforeEach((to, from, next) => {
  end = Performance.startExecute(`${from.path} => ${to.path} route timing`) /// route performance monitoring
  next()
  setTimeout(() => {
    end()
  }, 0)
})

router.afterEach(() => {})
