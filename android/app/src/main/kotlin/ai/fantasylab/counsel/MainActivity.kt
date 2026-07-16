// Counsel Engine — native Android proof.
//
// This is aurora-core (Rust, golden-parity vs the Python engine) running as a
// REAL native library on Android, called through the uniffi-generated Kotlin
// bindings. No server, no WebView, no cloud: the ledger is parsed, the
// change-point found, the significance tested and the forecast banded — all
// on the phone, in milliseconds. The narration is the bounded template from
// the Counsel narrator: the model never computes, phrasing only.

package ai.fantasylab.counsel

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import uniffi.aurora_core.ar1
import uniffi.aurora_core.changepoints
import uniffi.aurora_core.welch
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Locale

private const val PAPER = 0xFFE9ECE7.toInt()
private const val CARD = 0xFFFBFBF9.toInt()
private const val INK = 0xFF18211C.toInt()
private const val INK_CARD = 0xFF152019.toInt()
private const val BONE = 0xFFECE9DF.toInt()
private const val BONE_DIM = 0xFF9CA79B.toInt()
private const val MUTED = 0xFF77857B.toInt()
private const val FOREST = 0xFF1C4B3A.toInt()
private const val BRASS = 0xFF9C7A46.toInt()
private const val BRASS_LT = 0xFFD8C19A.toInt()

class MainActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val dp = resources.displayMetrics.density
        fun px(v: Int) = (v * dp).toInt()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(PAPER)
            setPadding(px(20), px(48), px(20), px(40))
        }

        fun label(text: String, color: Int = MUTED, size: Float = 10f, mono: Boolean = true) =
            TextView(this).apply {
                this.text = text
                setTextColor(color)
                textSize = size
                typeface = if (mono) Typeface.MONOSPACE else Typeface.SANS_SERIF
                letterSpacing = 0.12f
            }

        fun body(text: String, color: Int = INK, size: Float = 15f, serif: Boolean = false) =
            TextView(this).apply {
                this.text = text
                setTextColor(color)
                textSize = size
                typeface = if (serif) Typeface.SERIF else Typeface.SANS_SERIF
                setLineSpacing(0f, 1.35f)
            }

        fun card(bg: Int, radius: Float = 22f): LinearLayout =
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(px(18), px(18), px(18), px(18))
                background = android.graphics.drawable.GradientDrawable().apply {
                    setColor(bg)
                    cornerRadius = radius * dp
                }
            }

        fun gap(h: Int) = android.widget.Space(this).apply {
            layoutParams = LinearLayout.LayoutParams(1, px(h))
        }

        // ---- load ledger from assets --------------------------------------
        val json = assets.open("kiln_daily.json").bufferedReader().use { it.readText() }
        val obj = JSONObject(json)
        val datesArr = obj.getJSONArray("dates")
        val revArr = obj.getJSONArray("revenue")
        val revenue = DoubleArray(revArr.length()) { revArr.getDouble(it) }.toList()
        val nDays = revenue.size

        // ---- run the engine (timed) ----------------------------------------
        val t0 = System.nanoTime()
        val cps = changepoints(revenue, "rbf", 10.0)
        val msPelt = (System.nanoTime() - t0) / 1e6

        var msWelch = 0.0
        var narration = "No structural break at this sensitivity — the series reads as one regime."
        var statLine = "PELT (rbf) · penalty 10 · $nDays days"
        val money = NumberFormat.getIntegerInstance(Locale.US)

        if (cps.isNotEmpty()) {
            val brk = cps.last().toInt()
            if (brk in 9 until nDays - 4) {
                val before = revenue.subList(0, brk)
                val after = revenue.subList(brk, nDays)
                val t1 = System.nanoTime()
                val w = welch(before, after)
                msWelch = (System.nanoTime() - t1) / 1e6
                val bMean = before.average()
                val aMean = after.average()
                val pct = ((aMean / bMean - 1) * 100).toInt()
                val dateRaw = datesArr.getString(brk)
                val pretty = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(dateRaw)
                    ?.let { SimpleDateFormat("MMMM d", Locale.US).format(it) } ?: dateRaw
                val pPlain = when {
                    w.p < 0.001 -> "less than a 1-in-1,000 chance this is noise"
                    w.p < 0.01 -> "less than a 1-in-100 chance this is noise"
                    w.p < 0.05 -> "less than a 1-in-20 chance this is noise"
                    else -> "within normal variation"
                }
                narration = "Your revenue structurally changed on $pretty — from about " +
                    "$${money.format(bMean)}/day to $${money.format(aMean)}/day ($pct%). " +
                    "That's a real break, not a slow week: $pPlain."
                statLine = "break idx $brk · p ${if (w.p < 0.001) "< 0.001" else "= %.3f".format(w.p)} · Welch t"
            }
        }

        val t2 = System.nanoTime()
        val fc = ar1(revenue, 30u, 0.05)
        val msAr1 = (System.nanoTime() - t2) / 1e6
        val fcLine = if (fc != null) {
            val lo = fc.lo.sum(); val hi = fc.hi.sum()
            "Next 30 days, honestly: between $${money.format(lo / 1000)}k and $${money.format(hi / 1000)}k (AR(1) + 95% bands)."
        } else "Series too short for a banded forecast."

        // ---- UI --------------------------------------------------------------
        root.addView(label("◆ COUNSEL · AURORA-CORE NATIVE", FOREST, 11f))
        root.addView(gap(6))
        root.addView(body("The engine, on Android.", INK, 28f, serif = true).apply {
            setTypeface(Typeface.SERIF, Typeface.BOLD)
        })
        root.addView(gap(14))

        val dark = card(INK_CARD)
        dark.addView(label("COMPUTED ON THIS PHONE", BRASS_LT, 9.5f))
        dark.addView(gap(8))
        dark.addView(body("No server. No cloud. Just math, here.", BONE, 19f, serif = true))
        dark.addView(gap(10))
        dark.addView(body(
            "PELT ${"%.1f".format(msPelt)} ms · Welch ${"%.2f".format(msWelch)} ms · AR(1) ${"%.2f".format(msAr1)} ms — " +
                "on $nDays days of ledger data. Airplane mode cannot stop it.",
            BONE_DIM, 12.5f))
        root.addView(dark)
        root.addView(gap(16))

        root.addView(label("THE FINDING · NARRATED ON-DEVICE", MUTED))
        root.addView(gap(6))
        val find = card(CARD)
        find.addView(body("“$narration”", INK, 15.5f, serif = true))
        find.addView(gap(10))
        find.addView(label(statLine, BRASS, 9.5f))
        root.addView(find)
        root.addView(gap(12))

        val fcCard = card(CARD)
        fcCard.addView(body(fcLine, INK, 14f))
        fcCard.addView(gap(8))
        fcCard.addView(label("SAME CRATE AS DESKTOP · GOLDEN-PARITY VS PYTHON", MUTED, 8.5f))
        root.addView(fcCard)
        root.addView(gap(18))

        root.addView(body(
            "powered by Aurora — the glass box for data",
            MUTED, 11.5f).apply { gravity = Gravity.CENTER_HORIZONTAL })

        setContentView(ScrollView(this).apply { addView(root) })
    }
}
