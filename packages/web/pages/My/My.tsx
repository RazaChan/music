import PlayLikedSongsCard from './PlayLikedSongsCard'
import PageTransition from '@/web/components/PageTransition'
import RecentlyListened from './RecentlyListened'
import Collections from './Collections'
import { useIsLoggedIn } from '@/web/api/hooks/useUser'
import { PleaseLogin } from '@/web/components/AsyncState'
import { LayoutGroup } from 'framer-motion'
import React from 'react'

const My = () => {
  const isLoggedIn = useIsLoggedIn()
  // useIsLoggedIn 在账号查询加载中时返回 true —— 加载期先渲染内容骨架，
  // 确认未登录后才显示引导，避免登录用户看到引导闪烁
  if (!isLoggedIn) {
    return (
      <PageTransition>
        <PleaseLogin />
      </PageTransition>
    )
  }
  return (
    <PageTransition>
      <LayoutGroup>
        <div className='grid grid-cols-1 gap-10'>
          <PlayLikedSongsCard />
          <RecentlyListened />
          <Collections />
        </div>
      </LayoutGroup>
    </PageTransition>
  )
}

const MyMemo = React.memo(My)
MyMemo.displayName = "My"

export default MyMemo
