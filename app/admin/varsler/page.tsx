import { getNotifications } from '@/lib/actions/notifications'
import VarslerClient from './VarslerClient'

export default async function VarslerPage() {
  const notifications = await getNotifications()
  return <VarslerClient notifications={notifications} />
}
