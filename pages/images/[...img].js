import { useRouter } from 'next/router'

const Post = () => {
  const router = useRouter()
  const { img } = router.query

  return <p>Post: {img[0]}</p>
}

export default Post