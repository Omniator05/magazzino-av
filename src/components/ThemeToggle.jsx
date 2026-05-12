export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark'

  return (
    <label style={{ cursor:'pointer', display:'inline-block' }}>
      <input
        className="bb8-slider"
        type="checkbox"
        checked={isDark}
        onChange={onToggle}
        style={{ display:'none' }}
      />
      <div className="bb8-switch">
        <div className="bb8-suns" />
        <div className="bb8-moons">
          <div className="bb8-star bb8-star-1" />
          <div className="bb8-star bb8-star-2" />
          <div className="bb8-star bb8-star-3" />
          <div className="bb8-star bb8-star-4" />
          <div className="bb8-star bb8-star-5" />
          <div className="bb8-first-moon" />
        </div>
        <div className="bb8-sand" />
        <div className="bb8-droid">
          <div className="bb8-antennas">
            <div className="bb8-antenna bb8-short" />
            <div className="bb8-antenna bb8-long" />
          </div>
          <div className="bb8-head">
            <div className="bb8-stripe bb8-one" />
            <div className="bb8-stripe bb8-two" />
            <div className="bb8-eyes">
              <div className="bb8-eye bb8-eye-one" />
              <div className="bb8-eye bb8-eye-two" />
            </div>
            <div className="bb8-stripe bb8-detail">
              <div className="bb8-det bb8-det-zero" />
              <div className="bb8-det bb8-det-zero" />
              <div className="bb8-det bb8-det-one" />
              <div className="bb8-det bb8-det-two" />
              <div className="bb8-det bb8-det-three" />
              <div className="bb8-det bb8-det-four" />
              <div className="bb8-det bb8-det-five" />
              <div className="bb8-det bb8-det-five" />
            </div>
            <div className="bb8-stripe bb8-three" />
          </div>
          <div className="bb8-ball">
            <div className="bb8-lines bb8-lines-one" />
            <div className="bb8-lines bb8-lines-two" />
            <div className="bb8-ring bb8-ring-one" />
            <div className="bb8-ring bb8-ring-two" />
            <div className="bb8-ring bb8-ring-three" />
          </div>
          <div className="bb8-shadow" />
        </div>
      </div>
    </label>
  )
}
