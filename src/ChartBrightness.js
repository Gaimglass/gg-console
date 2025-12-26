import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'

export default function ChartBrightness({exponent}) {

  const generateCurveData = (exponent, numPoints=100)=>{
    const data = [];
    for (let i = 0; i <= numPoints; i++) {
      const x = i / numPoints; // x from 0 to 1
      const y = Math.pow(x, exponent);
      data.push([x, y]);
    }
    return data;  
  }

  return (
    <HighchartsReact
          highcharts={Highcharts}
          options={{
          chart: {
            type: 'spline',
            width: 300,
            height: 170,
            backgroundColor: '#1b1d23',
            spacing: [5, 5, 5, 5],
            animation: false
          },
          title: {
            text: null
          },
          xAxis: {
            max: 1,
            title: {
              text: 'Screen Brightness'
            },
            labels: {
              enabled: true
            },
            lineWidth: 1,
            tickLength: 5
          },
          yAxis: {
            max: 1,
            title: {
              text: 'LED Brightness'
            },
            gridLineWidth: 0,
            labels: {
              enabled: true
            }
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
          series: [{
            name: 'Curve',
            data: generateCurveData(exponent)
          }]
        }}
      />
  );
}