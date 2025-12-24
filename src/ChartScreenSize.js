import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import { useRef, useMemo } from 'react';

export default function ChartScreenSize({percentSize=25}) {
  const chartRef = useRef(null);
  
  const rectData = {
    x: 5-(percentSize / 10)/2,
    y: 5-(percentSize / 10)/2,
    length: percentSize / 10,
    width: percentSize / 10,
  };

  const options = useMemo(() => ({
    chart: {
      width: 300,
      height: 170,
      backgroundColor: '#1b1d23',
      spacing: [5, 5, 5, 5],
      animation: false,
      events: {
        load() {
          drawRect(this);
        },
        redraw() {
          drawRect(this);
        }
      }
    },

    title: {
      text: null
    },
    credits: {
      enabled: false
    },
    tooltip: {
      enabled: false
    },
    legend: {
      enabled: false
    },
    plotOptions: {
      series: {
        animation: false
      }
    },

    xAxis: { 
      min: 0, max: 10 ,
      labels: {
                  enabled: true
                },
                lineWidth: 1,
                tickLength: 5
    },
    yAxis: { min: 0, max: 10 },

    /*series: [{
      type: 'line',
      data: [1, 3, 5, 7]
    }]*/
  }), [percentSize]);

  function drawRect(chart) {
    const { x, y, length, width } = rectData;

    const x0 = chart.xAxis[0].toPixels(x);
    const x1 = chart.xAxis[0].toPixels(x + width);
    const y0 = chart.yAxis[0].toPixels(y);
    const y1 = chart.yAxis[0].toPixels(y + length);

    // Create once, update thereafter
    if (!chart.customRect) {
      chart.customRect = chart.renderer
        .rect(
          x0,
          y1, // inverted y-axis
          x1 - x0,
          y0 - y1
        )
        .attr({
          fill: 'rgba(0, 120, 255, 0.3)',
          stroke: '#0078ff',
          'stroke-width': 2,
          zIndex: 10
        })
        .add();
    } else {
      chart.customRect.attr({
        x: x0,
        y: y1,
        width: x1 - x0,
        height: y0 - y1
      });
    }
  }

  return (
    <HighchartsReact
      highcharts={Highcharts}
      options={options}
      ref={chartRef}
    />
  );
}