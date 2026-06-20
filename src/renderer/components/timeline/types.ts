/** Dot style: solid (finished) or hollow ring (in progress). */
export type VTimelineItemFill = 'filled' | 'outlined'

export interface VTimelineItem {
  id?: string
  label: string
  fill?: VTimelineItemFill
  slotName?: string
}
