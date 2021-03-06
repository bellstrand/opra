test 'concat-inline-compressed', {
  'index.html': """
    <html>
      <!--OPRA foo.js
        f1.js
        f2.js compress
      -->
      <!--OPRA bar.js
        f1.js
      -->
      <!--OPRA c.css compress
        c1.css
        c2.css never-compress
        c1.css
      -->
    </html>
  """
  'f1.js': """
    alert(1 + 1)
  """
  'f2.js': """
    alert(2 + 2)
  """
  'c1.css': """
    a { color: black; }
  """
  'c2.css': """
    a { color: red; }
  """
}, { concat: true, inline: true }, [
  """
    <html>
      <script type="text/javascript">
        alert(1 + 1);
        alert(4);
      </script>
      <script type="text/javascript">
        alert(1 + 1)
      </script>
      <style type="text/css">a{color:#000}
    a { color: red; }
    a{color:#000}</style>
    </html>
  """
,
  """
    <html>
      <script type="text/javascript">
        alert(1 + 1);
        alert(4)
      </script>
      <script type="text/javascript">
        alert(1 + 1)
      </script>
      <style type="text/css">a{color:#000}
    a { color: red; }
    a{color:#000}</style>
    </html>
  """
]
