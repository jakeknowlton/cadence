import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    /** No sign-in needed. */
    public?: boolean
    /** Render without the app shell chrome. */
    bare?: boolean
    requiresAdmin?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'today', component: () => import('@/views/TodayView.vue') },
    { path: '/groups', name: 'groups', component: () => import('@/views/GroupsView.vue') },
    { path: '/inbox', name: 'inbox', component: () => import('@/views/InboxView.vue') },
    { path: '/me', name: 'me', component: () => import('@/views/MeView.vue') },
    { path: '/admin', redirect: { name: 'admin-users' }, meta: { requiresAdmin: true } },
    {
      path: '/admin/users',
      name: 'admin-users',
      component: () => import('@/views/admin/AdminUsersView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/admin/groups',
      name: 'admin-groups',
      component: () => import('@/views/admin/AdminGroupsView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/admin/groups/:id',
      name: 'admin-group',
      component: () => import('@/views/admin/AdminGroupView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/admin/groups/:id/tasks/new',
      name: 'admin-task-new',
      component: () => import('@/views/admin/AdminTaskView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/admin/groups/:id/tasks/:taskId',
      name: 'admin-task-edit',
      component: () => import('@/views/admin/AdminTaskView.vue'),
      meta: { requiresAdmin: true },
    },
    { path: '/groups/:id', name: 'group', component: () => import('@/views/GroupView.vue') },
    { path: '/groups/:id/history', name: 'group-history', component: () => import('@/views/GroupHistoryView.vue') },
    { path: '/groups/:id/stats', name: 'group-stats', component: () => import('@/views/GroupStatsView.vue') },
    { path: '/groups/:id/settings', name: 'group-settings', component: () => import('@/views/GroupSettingsView.vue') },
    { path: '/me/history', name: 'me-history', component: () => import('@/views/MeHistoryView.vue') },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true, bare: true },
    },
    {
      path: '/invite/:token',
      name: 'invite',
      component: () => import('@/views/InviteView.vue'),
      meta: { public: true, bare: true },
    },
    {
      path: '/no-access',
      name: 'no-access',
      component: () => import('@/views/NoAccessView.vue'),
      meta: { public: true, bare: true },
    },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  await authStore.ready()

  if (to.meta.public) {
    // A signed-in, active user has no business on the login page.
    if (to.name === 'login' && authStore.isActive) return { name: 'today' }
    return true
  }
  if (!authStore.isSignedIn) return { name: 'login', query: { redirect: to.fullPath } }
  if (!authStore.isActive) return { name: 'no-access' }
  if (to.meta.requiresAdmin && !authStore.isAdmin) return { name: 'today' }
  return true
})

export default router
