vcl 4.1;

backend default {
    .host = "app";
    .port = "8000";
}

sub vcl_recv {
    if (req.url ~ "^/(myships|login|callback|myfavorite|logoff)") {
        return (pass);
    }
    # Cache static assets like CSS and JS
    if (req.url ~ "\.(css|js)(\?.*)?$") {
        unset req.http.Cookie;
    }
}

sub vcl_backend_response {
    if (bereq.url ~ "^/(myships|login|callback|myfavorite|logoff)") {
        set beresp.ttl = 0s;
        return (pass);
    }
    set beresp.ttl = 45m;
    if (bereq.url ~ "\.(css|js)(\?.*)?$") {
        set beresp.ttl = 1h;  # or whatever cache time you prefer
        unset beresp.http.Set-Cookie;
    }
}

sub vcl_deliver {
    if (obj.hits > 0) {
        set resp.http.X-Cache = "HIT";
    } else {
        set resp.http.X-Cache = "MISS";
    }
}
