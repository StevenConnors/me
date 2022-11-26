import { useRouter } from 'next/router'

const Post = () => {
  const router = useRouter()
  const { img } = router.query

  return <p>Post: {img}</p>
}

export default Post