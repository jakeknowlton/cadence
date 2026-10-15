import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'

const authState = { isAdmin: false }
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))
vi.mock('@/stores/inbox', () => ({ useInboxStore: () => ({ unreadCount: 0 }) }))

async function mountShell() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'today', component: { template: '<div />' } }],
  })
  await router.push('/')
  return mount(AppShell, { global: { plugins: [router] } })
}

describe('AppShell', () => {
  it('renders the four member tabs in both the sidebar and the tab bar, and no admin tab for a non-admin', async () => {
    authState.isAdmin = false
    const wrapper = await mountShell()
    const labels = wrapper.findAll('nav[aria-label="Primary"] a').map((a) => a.text())
    expect(labels).toEqual(['Today', 'Groups', 'Inbox', 'Me', 'Today', 'Groups', 'Inbox', 'Me'])
  })

  it('adds the admin tab for an admin', async () => {
    authState.isAdmin = true
    const wrapper = await mountShell()
    expect(wrapper.text()).toContain('Admin')
  })
})
