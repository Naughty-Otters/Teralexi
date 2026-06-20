import { RouteRecordRaw } from 'vue-router'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@renderer/views/404.vue'),
  },
  {
    path: '/',
    name: 'AgentChat',
    component: () => import('@renderer/views/agent-chat/AgentChat.vue'),
  },
  {
    path: '/landing',
    name: 'LandingPage',
    component: () => import('@renderer/views/landing-page/LandingPage.vue'),
  },
]

export default routes
