import router from './router'
import Performance from '@renderer/utils/performance'
import { isOnboardingComplete } from '@renderer/lib/onboarding-route-state'

var end = null
router.beforeEach(async (to, from, next) => {
  end = Performance.startExecute(`${from.path} => ${to.path} route timing`)

  try {
    const completed = await isOnboardingComplete()
    if (!completed && to.path !== '/onboarding') {
      next('/onboarding')
      return
    }
    if (completed && to.path === '/onboarding') {
      next('/')
      return
    }
  } catch (error) {
    console.error('[router] onboarding gate failed; defaulting to onboarding', error)
    if (to.path !== '/onboarding') {
      next('/onboarding')
      return
    }
  }

  next()
  setTimeout(() => {
    end()
  }, 0)
})

router.afterEach(() => {})
